import { workflowTransaction } from '../pedidos/order-workflow';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { productionTrackingSummary } from './production-tracking';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductCategory } from '../productos/catalogo/entidades/product-category.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryMovementType } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { StockReplenishmentRequestDetail } from '../almacen/entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from '../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../almacen/entidades/inventory.enums';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import {
  AdjustProductionPlanDto,
  CloseProductionConsolidationDto,
  CreateProductionAreaDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
  RegisterProductionDeliveryDto,
  ReceiveProductionDeliveryDto,
  ScheduleProductionDetailDto,
  ProductionReasonDto,
  UpdateProductionAreaDto,
} from './dto/production.dto';
import { ProductionArea } from './entidades/production-area.entity';
import { ProductionConsolidationDetail } from './entidades/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entidades/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entidades/production-consolidation-source.entity';
import { ProductionConsolidation } from './entidades/production-consolidation.entity';
import { ProductionProgress } from './entidades/production-progress.entity';
import { ProductionDelivery } from './entidades/production-delivery.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionDeliveryStatus,
  ProductionDetailStage,
  ProductionHistoryEvent,
  ProductionProgressType,
} from './entidades/production.enums';
import {
  baseContribution,
  batchAdjustment,
  decimalForScale,
  productionDifference,
  roundForScale,
} from './production-calculations';

interface ResolvedSource {
  orderDetail: OrderDetail;
  originalQuantity: number;
  reservedQuantity: number;
  pendingQuantity: number;
  appliedFactor: number;
  baseContribution: number;
  warehouseContribution: number;
  productionContribution: number;
  decimalScale: number;
}

interface ConsolidatedGroup {
  productId: string;
  categoryId: string;
  productLineId: string;
  presentationId: string;
  baseUnitId: string;
  productionAreaId: string | null;
  decimalScale: number;
  requestedQuantity: number;
  warehouseCoveredQuantity: number;
  productionRequiredQuantity: number;
  stockRequestedQuantity: number;
  stockRequestDetailId: string | null;
  sources: ResolvedSource[];
}
import { ProductionServiceParte12 } from './production.12-validateDraftIntegrity';

export abstract class ProductionServiceParte11 extends ProductionServiceParte12 {
  protected async rebuildDraft(
      manager: EntityManager,
      consolidation: ProductionConsolidation,
      orderDetails: OrderDetail[],
      stockRequestId?: string,
    ): Promise<void> {
      const groups = new Map<string, ConsolidatedGroup>();
      const areas = await manager.getRepository(ProductionArea).find({
        where: { status: RecordStatus.ACTIVE },
        relations: { categories: true },
      });
      const areaByCategory = new Map(areas.flatMap((area) => area.categories.map((category) => [category.id, area.id] as const)));
      const stockRequestBuilder = manager.getRepository(StockReplenishmentRequest).createQueryBuilder('request')
        .leftJoinAndSelect('request.details', 'requestDetail')
        .leftJoinAndSelect('requestDetail.presentation', 'requestPresentation')
        .leftJoinAndSelect('requestPresentation.unit', 'requestUnit')
        .leftJoinAndSelect('requestPresentation.product', 'requestProduct')
        .leftJoinAndSelect('requestProduct.category', 'requestCategory')
        .leftJoinAndSelect('requestProduct.productLine', 'requestProductLine');
      if (stockRequestId) {
        stockRequestBuilder
          .where('request.id = :stockRequestId', { stockRequestId })
          .andWhere('request.status = :sent', { sent: StockReplenishmentRequestStatus.SENT });
      } else {
        stockRequestBuilder
          .where('request.productionConsolidationId = :consolidationId', { consolidationId: consolidation.id })
          .andWhere('request.status = :scheduled', { scheduled: StockReplenishmentRequestStatus.SCHEDULED });
      }
      const stockRequest = await stockRequestBuilder.getOne();
      const sourceDate = stockRequest?.requiredDate ?? consolidation.deliveryDate;
      for (const orderDetail of orderDetails) {
        if (orderDetail.order.status !== OrderStatus.CONFIRMED || orderDetail.order.requestedDate !== sourceDate) {
          throw new UnprocessableEntityException('Solo se pueden consolidar detalles de pedidos Confirmados para la fecha seleccionada');
        }
        const presentation = orderDetail.presentation;
        const product = presentation?.product;
        const factor = Number(presentation?.conversionFactor);
        if (!product?.productLineId) throw new UnprocessableEntityException('Existe un producto sin línea productiva válida');
        if (!product.baseUnitId || !product.baseUnit) throw new UnprocessableEntityException('Existe un producto sin unidad base válida');
        if (!presentation?.id || !Number.isFinite(factor) || factor <= 0) {
          throw new UnprocessableEntityException(`La presentación ${orderDetail.presentationDescriptionSnapshot} no tiene un factor de conversión válido`);
        }
        const scale = presentation.unit.decimalScale;
        const baseScale = product.baseUnit.decimalScale;
        const original = Number(orderDetail.requestedQuantity);
        const reserved = Number(orderDetail.reservedQuantity);
        const pending = Number(orderDetail.pendingQuantity);
        const contribution = baseContribution(original, factor, baseScale);
        const warehouseContribution = baseContribution(reserved, factor, baseScale);
        const productionContribution = roundForScale(contribution - warehouseContribution, baseScale);
        if (
          !Number.isFinite(original) || !Number.isFinite(reserved) || !Number.isFinite(pending)
          || original <= 0 || reserved < 0 || pending < 0 || contribution <= 0
          || Math.abs(original - reserved - pending) > 0.000001
          || productionContribution < 0
        ) {
          throw new UnprocessableEntityException('La conversión produjo una cantidad no válida');
        }
        const key = presentation.id;
        const group = groups.get(key) ?? {
          productId: product.id,
          categoryId: product.categoryId,
          productLineId: product.productLineId,
          presentationId: presentation.id,
          baseUnitId: presentation.unitId,
          productionAreaId: areaByCategory.get(product.categoryId) ?? null,
          decimalScale: scale,
          requestedQuantity: 0,
          warehouseCoveredQuantity: 0,
          productionRequiredQuantity: 0,
          stockRequestedQuantity: 0,
          stockRequestDetailId: null,
          sources: [],
        };
        group.requestedQuantity = roundForScale(group.requestedQuantity + original, scale);
        group.warehouseCoveredQuantity = roundForScale(group.warehouseCoveredQuantity + reserved, scale);
        group.productionRequiredQuantity = roundForScale(group.productionRequiredQuantity + pending, scale);
        group.sources.push({
          orderDetail,
          originalQuantity: original,
          reservedQuantity: reserved,
          pendingQuantity: pending,
          appliedFactor: factor,
          baseContribution: contribution,
          warehouseContribution,
          productionContribution,
          decimalScale: 6,
        });
        groups.set(key, group);
      }
      for (const requestDetail of stockRequest?.details ?? []) {
        const presentation = requestDetail.presentation;
        const product = presentation.product;
        if (presentation.status !== RecordStatus.ACTIVE || product.status !== RecordStatus.ACTIVE) {
          throw new UnprocessableEntityException('La solicitud de abastecimiento contiene una presentación o producto inactivo');
        }
        const productionAreaId = areaByCategory.get(product.categoryId) ?? null;
        if (!productionAreaId) {
          throw new UnprocessableEntityException(`La categoría ${product.category.name} no tiene un área de Producción activa asignada`);
        }
        const scale = presentation.unit.decimalScale;
        const requestedStock = roundForScale(Number(requestDetail.additionalStockQuantity), scale);
        const existingGroup = groups.get(presentation.id);
        if (!Number.isFinite(requestedStock) || requestedStock < 0) {
          throw new UnprocessableEntityException('La solicitud de abastecimiento contiene una cantidad adicional inválida');
        }
        if (requestedStock === 0 && (!existingGroup || existingGroup.productionRequiredQuantity <= 0)) {
          throw new UnprocessableEntityException('La solicitud contiene un producto sin faltante ni cantidad adicional para stock');
        }
        const group = existingGroup ?? {
          productId: product.id,
          categoryId: product.categoryId,
          productLineId: product.productLineId,
          presentationId: presentation.id,
          baseUnitId: presentation.unitId,
          productionAreaId,
          decimalScale: scale,
          requestedQuantity: 0,
          warehouseCoveredQuantity: 0,
          productionRequiredQuantity: 0,
          stockRequestedQuantity: 0,
          stockRequestDetailId: null,
          sources: [],
        };
        group.categoryId = product.categoryId;
        group.productionAreaId = productionAreaId;
        group.stockRequestedQuantity = requestedStock;
        group.stockRequestDetailId = requestDetail.id;
        requestDetail.categoryId = product.categoryId;
        requestDetail.productionAreaId = productionAreaId;
        await manager.getRepository(StockReplenishmentRequestDetail).save(requestDetail);
        groups.set(presentation.id, group);
      }
      const detailRepository = manager.getRepository(ProductionConsolidationDetail);
      const existing = await detailRepository.find({ where: { consolidationId: consolidation.id } });
      const existingPlans = new Map(existing.filter((detail) => detail.presentationId).map((detail) => [
        detail.presentationId!,
        {
          additionalQuantity: Number(detail.additionalProductionQuantity),
          reason: detail.additionalProductionReason,
          scheduledDate: detail.scheduledDate,
          sequence: detail.sequence,
        },
      ]));
      if (existing.length) await detailRepository.remove(existing);
      const sequenceByArea = new Map<string, number>();
      for (const group of groups.values()) {
        const existingPlan = existingPlans.get(group.presentationId);
        const productionAreaId = areaByCategory.get(group.categoryId) ?? group.productionAreaId;
        const areaSequence = (sequenceByArea.get(productionAreaId ?? 'none') ?? 0) + 1;
        sequenceByArea.set(productionAreaId ?? 'none', areaSequence);
        const additional = roundForScale(existingPlan?.additionalQuantity ?? 0, group.decimalScale);
        const plannedQuantity = roundForScale(
          group.productionRequiredQuantity + group.stockRequestedQuantity + additional,
          group.decimalScale,
        );
        const detail = await detailRepository.save(detailRepository.create({
          consolidationId: consolidation.id,
          productId: group.productId,
          categoryId: group.categoryId,
          presentationId: group.presentationId,
          productionAreaId,
          productLineId: group.productLineId,
          baseUnitId: group.baseUnitId,
          requestedQuantity: decimalForScale(group.requestedQuantity, group.decimalScale),
          warehouseCoveredQuantity: decimalForScale(group.warehouseCoveredQuantity, group.decimalScale),
          productionRequiredQuantity: decimalForScale(group.productionRequiredQuantity, group.decimalScale),
          stockRequestedQuantity: decimalForScale(group.stockRequestedQuantity, group.decimalScale),
          stockRequestDetailId: group.stockRequestDetailId,
          additionalProductionQuantity: decimalForScale(additional, group.decimalScale),
          plannedQuantity: decimalForScale(plannedQuantity, group.decimalScale),
          additionalProductionReason: additional > 0 ? existingPlan?.reason ?? null : null,
          preparedQuantity: decimalForScale(0, group.decimalScale),
          receivedQuantity: decimalForScale(0, group.decimalScale),
          stage: ProductionDetailStage.PENDING,
          scheduledDate: existingPlan?.scheduledDate ?? consolidation.deliveryDate,
          sequence: existingPlan?.sequence ?? areaSequence,
          startedAt: null,
          completedAt: null,
          canceledById: null,
          canceledAt: null,
          cancellationReason: null,
          difference: decimalForScale(-plannedQuantity, group.decimalScale),
        }));
        await manager.getRepository(ProductionConsolidationSource).save(group.sources.map((source) =>
          manager.getRepository(ProductionConsolidationSource).create({
            consolidatedDetailId: detail.id,
            orderDetailId: source.orderDetail.id,
            presentationId: source.orderDetail.presentationId,
            originalQuantity: decimalForScale(source.originalQuantity, source.decimalScale),
            reservedQuantity: decimalForScale(source.reservedQuantity, source.decimalScale),
            pendingQuantity: decimalForScale(source.pendingQuantity, source.decimalScale),
            appliedFactor: source.appliedFactor.toFixed(6),
            baseContribution: decimalForScale(source.baseContribution, source.decimalScale),
            warehouseContribution: decimalForScale(source.warehouseContribution, source.decimalScale),
            productionContribution: decimalForScale(source.productionContribution, source.decimalScale),
          })));
      }
      if (stockRequest?.status === StockReplenishmentRequestStatus.SENT) {
        stockRequest.status = StockReplenishmentRequestStatus.SCHEDULED;
        stockRequest.productionConsolidationId = consolidation.id;
        stockRequest.scheduledAt = new Date();
        await manager.getRepository(StockReplenishmentRequest).save(stockRequest);
      }
    }
}
