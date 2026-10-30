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
import { ProductionServiceParte06 } from './production.06-receiveDelivery';

export abstract class ProductionServiceParte05 extends ProductionServiceParte06 {
  async registerDelivery(
      id: string,
      detailId: string,
      dto: RegisterProductionDeliveryDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const detail = await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder('detail')
          .innerJoinAndSelect('detail.consolidation', 'consolidation')
          .innerJoinAndSelect('detail.product', 'product')
          .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
          .innerJoinAndSelect('detail.presentation', 'presentation')
          .setLock('pessimistic_write')
          .where('detail.id = :detailId', { detailId })
          .andWhere('detail.consolidationId = :id', { id })
          .getOne();
        if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
        this.assertProductionAreaAccess(actor, detail.productionAreaId);
        if (detail.consolidation.status !== ProductionConsolidationStatus.IN_PROGRESS) {
          throw new ConflictException('La orden debe estar En proceso para registrar una entrega');
        }
        if (![ProductionDetailStage.IN_PROGRESS, ProductionDetailStage.PARTIALLY_RECEIVED].includes(detail.stage)) {
          throw new ConflictException('Debe iniciar este producto antes de registrar su entrega');
        }
        if (!detail.presentationId || !detail.presentation) {
          throw new UnprocessableEntityException('El producto no tiene una presentación definida para su ingreso a Almacén');
        }
        const pendingDelivery = await manager.getRepository(ProductionDelivery).findOne({
          where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
        });
        if (pendingDelivery) throw new ConflictException('Este producto ya tiene una entrega pendiente de recepción en Almacén');
        const scale = detail.baseUnit.decimalScale;
        const quantity = roundForScale(dto.quantity, scale);
        if (quantity <= 0) throw new BadRequestException('La cantidad entregada no es válida para la presentación');
        const produced = roundForScale(Number(detail.preparedQuantity) + quantity, scale);
        const difference = productionDifference(produced, Number(detail.plannedQuantity), scale);
        if (!dto.finalDelivery && produced >= Number(detail.plannedQuantity)) {
          throw new UnprocessableEntityException('Al completar o superar el plan, la entrega debe marcarse como final');
        }
        const incident = dto.incident?.trim() || null;
        if (dto.finalDelivery && difference !== 0 && !incident) {
          throw new UnprocessableEntityException('Debe documentar el motivo cuando la cantidad real sea distinta al plan');
        }
        const productionFinishedAt = new Date();
        const delivery = await manager.getRepository(ProductionDelivery).save(manager.getRepository(ProductionDelivery).create({
          consolidatedDetailId: detail.id,
          deliveredQuantity: decimalForScale(quantity, scale),
          finalDelivery: dto.finalDelivery,
          productionIncident: incident,
          status: ProductionDeliveryStatus.PENDING,
          deliveredById: actor.id,
          receivedQuantity: null,
          receivedById: null,
          receivedAt: null,
          warehouseObservation: null,
          deliveredAt: productionFinishedAt,
        }));
        await manager.getRepository(ProductionProgress).save(manager.getRepository(ProductionProgress).create({
          consolidatedDetailId: detail.id,
          quantity: decimalForScale(quantity, scale),
          type: ProductionProgressType.PROGRESS,
          userId: actor.id,
          observation: incident || (dto.finalDelivery ? 'Entrega final enviada a Almacén' : 'Entrega parcial enviada a Almacén'),
        }));
        detail.preparedQuantity = decimalForScale(produced, scale);
        detail.difference = decimalForScale(difference, scale);
        detail.stage = ProductionDetailStage.PENDING_RECEIPT;
        if (dto.finalDelivery) detail.completedAt = productionFinishedAt;
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        await this.saveHistory(manager, id, detail.consolidation.status, detail.consolidation.status, ProductionHistoryEvent.DELIVERY, actor.id, `${detail.product.name}: ${decimalForScale(quantity, scale)} ${detail.presentation.description} entregados${dto.finalDelivery ? ' (entrega final)' : ' (entrega parcial)'}. Fin de producción: ${productionFinishedAt.toISOString()}${incident ? `. Incidencia: ${incident}` : ''}`);
        await this.saveAudit(manager, actor.id, 'ENTREGAR_PRODUCTO_A_ALMACEN', id, { deliveryId: delivery.id, consolidatedDetailId: detail.id, quantity, finalDelivery: dto.finalDelivery, difference, productionFinishedAt: productionFinishedAt.toISOString() });
      });
      return this.findOne(id, actor);
    }

  pendingDeliveries(): Promise<ProductionDelivery[]> {
      return this.deliveryRepository.find({
        where: { status: ProductionDeliveryStatus.PENDING },
        relations: {
          consolidatedDetail: {
            product: true,
            category: true,
            productLine: true,
            presentation: { unit: true },
            productionArea: true,
            consolidation: true,
          },
        },
        order: { deliveredAt: 'ASC' },
      });
    }

  async pendingStockRequests(actor: AuthenticatedUser): Promise<StockReplenishmentRequest[]> {
      const requests = await this.dataSource.getRepository(StockReplenishmentRequest).find({
        where: { status: StockReplenishmentRequestStatus.SENT },
        relations: {
          requestedBy: true,
          sentBy: true,
          details: {
            category: true,
            productionArea: true,
            presentation: { unit: true, product: { category: true, productLine: true } },
          },
        },
        order: { requiredDate: 'ASC', code: 'ASC' },
      });
      const areaIds = this.productionAreaScope(actor);
      for (const request of requests) {
        if (areaIds) {
          request.details = request.details.filter((detail) =>
            detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId));
        }
        request.details.sort((left, right) =>
          (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '')
          || left.category.name.localeCompare(right.category.name)
          || left.presentation.product.name.localeCompare(right.presentation.product.name));
        Object.assign(request, { detailCount: request.details.length });
      }
      return requests.filter((request) => request.details.length > 0);
    }
}
