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
import { ProductionServiceParte13 } from './production.13-closeStockRequest';

export abstract class ProductionServiceParte12 extends ProductionServiceParte13 {
  protected async validateDraftIntegrity(manager: EntityManager, consolidation: ProductionConsolidation): Promise<void> {
      const sourceDate = await this.sourceDateFor(manager, consolidation);
      const details = await manager.getRepository(ProductionConsolidationDetail).find({
        where: { consolidationId: consolidation.id },
        relations: {
          baseUnit: true,
          presentation: true,
          category: true,
          productionArea: true,
          stockRequestDetail: { request: true },
          sources: { orderDetail: { order: true }, presentation: { product: { baseUnit: true } } },
        },
      });
      if (!details.length) throw new UnprocessableEntityException('El Borrador no contiene detalles consolidados');
      for (const detail of details) {
        if (!detail.presentationId || !detail.presentation) {
          throw new UnprocessableEntityException('Existe un producto sin presentación definida; recalcule la orden antes de emitir');
        }
        if (!detail.scheduledDate || !Number.isInteger(detail.sequence) || detail.sequence <= 0) {
          throw new UnprocessableEntityException('Cada producto debe tener fecha programada y secuencia válidas');
        }
        const area = await this.areaForCategory(manager, detail.categoryId!);
        if (!area) throw new UnprocessableEntityException(`La categoría ${detail.category?.name ?? ''} no tiene un área de Producción activa asignada`);
        detail.productionAreaId = area.id;
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        let demandTotal = 0;
        let warehouseTotal = 0;
        let productionTotal = 0;
        for (const source of detail.sources) {
          if (source.orderDetail.order.status !== OrderStatus.CONFIRMED || source.orderDetail.order.requestedDate !== sourceDate) {
            throw new UnprocessableEntityException('Una fuente dejó de ser un pedido Confirmado elegible');
          }
          const factor = Number(source.appliedFactor);
          if (!Number.isFinite(factor) || factor <= 0) throw new UnprocessableEntityException('Existe una fuente sin factor válido');
          const original = Number(source.originalQuantity);
          const reserved = Number(source.reservedQuantity);
          const pending = Number(source.pendingQuantity);
          if (Math.abs(original - reserved - pending) > 0.000001) {
            throw new UnprocessableEntityException('La cantidad solicitada no coincide con las cantidades cubierta y pendiente');
          }
          if (
            decimalForScale(Number(source.orderDetail.requestedQuantity), 6) !== decimalForScale(original, 6)
            || decimalForScale(Number(source.orderDetail.reservedQuantity), 6) !== decimalForScale(reserved, 6)
            || decimalForScale(Number(source.orderDetail.pendingQuantity), 6) !== decimalForScale(pending, 6)
          ) {
            throw new UnprocessableEntityException('Las cantidades reservadas o pendientes del pedido cambiaron después del cálculo');
          }
          const sourceScale = source.presentation.product.baseUnit.decimalScale;
          const expectedDemand = baseContribution(original, factor, sourceScale);
          const expectedWarehouse = baseContribution(reserved, factor, sourceScale);
          const expectedProduction = roundForScale(expectedDemand - expectedWarehouse, sourceScale);
          if (decimalForScale(expectedDemand, sourceScale) !== decimalForScale(Number(source.baseContribution), sourceScale)) {
            throw new UnprocessableEntityException('El aporte en unidad base no coincide con su cantidad y factor');
          }
          if (
            decimalForScale(expectedWarehouse, sourceScale) !== decimalForScale(Number(source.warehouseContribution), sourceScale)
            || decimalForScale(expectedProduction, sourceScale) !== decimalForScale(Number(source.productionContribution), sourceScale)
          ) {
            throw new UnprocessableEntityException('Los aportes de Almacén y Producción no coinciden con la reserva del pedido');
          }
          demandTotal = roundForScale(demandTotal + original, detail.baseUnit.decimalScale);
          warehouseTotal = roundForScale(warehouseTotal + reserved, detail.baseUnit.decimalScale);
          productionTotal = roundForScale(productionTotal + pending, detail.baseUnit.decimalScale);
        }
        if (decimalForScale(demandTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.requestedQuantity), detail.baseUnit.decimalScale)) {
          throw new UnprocessableEntityException('La suma de los pedidos de origen no coincide con el total consolidado');
        }
        if (
          decimalForScale(warehouseTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.warehouseCoveredQuantity), detail.baseUnit.decimalScale)
          || decimalForScale(productionTotal, detail.baseUnit.decimalScale) !== decimalForScale(Number(detail.productionRequiredQuantity), detail.baseUnit.decimalScale)
        ) {
          throw new UnprocessableEntityException('El saldo cubierto por Almacén o el faltante de Producción no coincide con sus fuentes');
        }
        const stockRequested = Number(detail.stockRequestedQuantity);
        if (detail.stockRequestDetail) {
          if (
            detail.stockRequestDetail.request.productionConsolidationId !== consolidation.id
            || detail.stockRequestDetail.request.status !== StockReplenishmentRequestStatus.SCHEDULED
            || decimalForScale(Number(detail.stockRequestDetail.additionalStockQuantity), detail.baseUnit.decimalScale)
              !== decimalForScale(stockRequested, detail.baseUnit.decimalScale)
          ) {
            throw new UnprocessableEntityException('La cantidad solicitada para stock no coincide con su solicitud de abastecimiento');
          }
        } else if (stockRequested !== 0) {
          throw new UnprocessableEntityException('Existe una cantidad para stock sin solicitud de abastecimiento asociada');
        }
        const required = Number(detail.productionRequiredQuantity) + stockRequested;
        const planned = Number(detail.plannedQuantity);
        const adjustment = Number(detail.additionalProductionQuantity);
        if (planned < required || decimalForScale(planned - required, detail.baseUnit.decimalScale) !== decimalForScale(adjustment, detail.baseUnit.decimalScale)) {
          throw new UnprocessableEntityException('El plan no coincide con el faltante, la solicitud para stock y el ajuste técnico');
        }
        if (planned <= 0 && !detail.sources.length) {
          throw new UnprocessableEntityException('Una fila sin pedidos debe conservar una solicitud para stock mayor a cero');
        }
      }
    }

  protected async sourceDateFor(manager: EntityManager, consolidation: ProductionConsolidation): Promise<string> {
      const stockRequest = await manager.getRepository(StockReplenishmentRequest).findOne({
        where: { productionConsolidationId: consolidation.id },
        select: { id: true, requiredDate: true },
      });
      return stockRequest?.requiredDate ?? consolidation.deliveryDate;
    }

  protected lockDeliveryDate(manager: EntityManager, deliveryDate: string): Promise<unknown> {
      return manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`production:${deliveryDate}`]);
    }

  protected async resolveAreaCategories(
      manager: EntityManager,
      categoryIds: string[],
      currentAreaId?: string,
    ): Promise<ProductCategory[]> {
      if (!categoryIds.length) return [];
      const categories = await manager.getRepository(ProductCategory).find({ where: { id: In(categoryIds) } });
      if (categories.length !== categoryIds.length) throw new UnprocessableEntityException('Una o más categorías no existen');
      if (categories.some((category) => category.status !== RecordStatus.ACTIVE)) {
        throw new ConflictException('No se puede asignar una categoría inactiva a un área de Producción');
      }
      const assigned = await manager.query<Array<{ categoryId: string; areaName: string }>>(
        `SELECT assignment.categoria_id AS "categoryId", area.nombre AS "areaName"
           FROM areas_produccion_categorias assignment
           JOIN areas_produccion area ON area.id = assignment.area_id
          WHERE assignment.categoria_id = ANY($1::uuid[])
            AND ($2::uuid IS NULL OR assignment.area_id <> $2::uuid)`,
        [categoryIds, currentAreaId ?? null],
      );
      if (assigned.length) throw new ConflictException(`Una categoría ya está asignada al área ${assigned[0].areaName}`);
      return categories;
    }

  protected async areaForCategory(manager: EntityManager, categoryId: string): Promise<ProductionArea | null> {
      return manager.getRepository(ProductionArea).createQueryBuilder('area')
        .innerJoinAndSelect('area.categories', 'category', 'category.id = :categoryId', { categoryId })
        .where('area.status = :status', { status: RecordStatus.ACTIVE })
        .getOne();
    }

  protected async closeIfCompleted(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
      const details = await manager.getRepository(ProductionConsolidationDetail).find({ where: { consolidationId } });
      const terminal = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
      if (
        !details.length
        || details.some((detail) => !terminal.includes(detail.stage))
        || details.some((detail) => Number(detail.receivedQuantity) < Number(detail.plannedQuantity))
      ) return;
      const consolidation = await manager.getRepository(ProductionConsolidation).findOne({ where: { id: consolidationId } });
      if (!consolidation || ![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) return;
      const previousStatus = consolidation.status;
      consolidation.status = ProductionConsolidationStatus.CLOSED;
      consolidation.closedById = userId;
      consolidation.closedAt = new Date();
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.closeStockRequest(manager, consolidationId, userId);
      await this.saveHistory(manager, consolidationId, previousStatus, ProductionConsolidationStatus.CLOSED, ProductionHistoryEvent.CLOSE, userId, 'Orden cerrada automáticamente al completar la recepción de todos los productos');
    }
}
