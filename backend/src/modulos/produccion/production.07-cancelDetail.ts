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
import { ProductionServiceParte08 } from './production.08-closeIncomplete';

export abstract class ProductionServiceParte07 extends ProductionServiceParte08 {
  async cancelDetail(
      id: string,
      detailId: string,
      dto: ProductionReasonDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      const reason = this.requiredReason(dto.reason);
      await workflowTransaction(this.dataSource, async (manager) => {
        const detail = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .innerJoinAndSelect('detail.consolidation', 'consolidation')
          .innerJoinAndSelect('detail.product', 'product')
          .setLock('pessimistic_write')
          .where('detail.id = :detailId', { detailId })
          .andWhere('detail.consolidationId = :id', { id })
          .getOne();
        if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
        this.assertProductionAreaAccess(actor, detail.productionAreaId);
        if (![ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(detail.consolidation.status)) {
          throw new ConflictException('El producto ya no puede cancelarse en el estado actual de la orden');
        }
        if ([ProductionDetailStage.COMPLETED, ProductionDetailStage.CANCELLED].includes(detail.stage)) {
          throw new ConflictException('El producto ya se encuentra completado o cancelado');
        }
        const pendingDeliveries = await manager.getRepository(ProductionDelivery).count({
          where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
        });
        if (pendingDeliveries) {
          throw new ConflictException('Almacén debe recibir la entrega pendiente antes de cancelar este producto');
        }
        detail.stage = ProductionDetailStage.CANCELLED;
        detail.canceledById = actor.id;
        detail.canceledAt = new Date();
        detail.completedAt = detail.canceledAt;
        detail.cancellationReason = reason;
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        await this.saveHistory(manager, id, detail.consolidation.status, detail.consolidation.status, ProductionHistoryEvent.PRODUCT_CANCELLATION, actor.id, `${detail.product.name}: ${reason}`);
        await this.saveAudit(manager, actor.id, 'CANCELAR_PRODUCTO_PRODUCCION', id, {
          consolidatedDetailId: detail.id,
          reason,
          preparedQuantity: detail.preparedQuantity,
          receivedQuantity: detail.receivedQuantity,
        });
      });
      return this.findOne(id, actor);
    }

  async cancel(
      id: string,
      dto: ProductionReasonDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      const reason = this.requiredReason(dto.reason);
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Orden de Producción no encontrada');
        if (![ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
          throw new ConflictException('La orden ya no puede cancelarse en su estado actual');
        }
        const details = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .setLock('pessimistic_write')
          .where('detail.consolidationId = :id', { id })
          .getMany();
        this.assertWholeOrderAccess(actor, details);
        if (details.some((detail) => Number(detail.receivedQuantity) > 0)) {
          throw new ConflictException('La orden ya tiene productos recibidos en Almacén; utilice cierre incompleto');
        }
        const pendingDeliveries = await manager.getRepository(ProductionDelivery).createQueryBuilder('delivery')
          .innerJoin('delivery.consolidatedDetail', 'detail')
          .where('detail.consolidationId = :id', { id })
          .andWhere('delivery.status = :status', { status: ProductionDeliveryStatus.PENDING })
          .getCount();
        if (pendingDeliveries) {
          throw new ConflictException('Almacén debe resolver las entregas pendientes antes de cancelar la orden');
        }
        const now = new Date();
        for (const detail of details) {
          detail.stage = ProductionDetailStage.CANCELLED;
          detail.canceledById = actor.id;
          detail.canceledAt = now;
          detail.completedAt = now;
          detail.cancellationReason = reason;
        }
        await manager.getRepository(ProductionConsolidationDetail).save(details);
        const previousStatus = consolidation.status;
        consolidation.status = ProductionConsolidationStatus.CANCELLED;
        consolidation.cancellationReason = reason;
        consolidation.canceledById = actor.id;
        consolidation.canceledAt = now;
        consolidation.closedById = actor.id;
        consolidation.closedAt = now;
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.closeStockRequestIncomplete(manager, id, actor.id, `Producción cancelada: ${reason}`);
        await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CANCELLED, ProductionHistoryEvent.ORDER_CANCELLATION, actor.id, reason);
        await this.saveAudit(manager, actor.id, 'CANCELAR_ORDEN_PRODUCCION', id, { reason });
      });
      return this.findOne(id, actor);
    }
}
