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
import { ProductionServiceParte09 } from './production.09-summary';

export abstract class ProductionServiceParte08 extends ProductionServiceParte09 {
  async closeIncomplete(
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
        if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
          throw new ConflictException('Solo una orden Emitida o En proceso puede cerrarse de manera incompleta');
        }
        const details = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .setLock('pessimistic_write')
          .where('detail.consolidationId = :id', { id })
          .getMany();
        if (!details.length) throw new UnprocessableEntityException('La orden no tiene productos');
        this.assertWholeOrderAccess(actor, details);
        const pendingDeliveries = await manager.getRepository(ProductionDelivery).createQueryBuilder('delivery')
          .innerJoin('delivery.consolidatedDetail', 'detail')
          .where('detail.consolidationId = :id', { id })
          .andWhere('delivery.status = :status', { status: ProductionDeliveryStatus.PENDING })
          .getCount();
        if (pendingDeliveries) {
          throw new ConflictException('Almacén debe resolver todas las entregas pendientes antes del cierre incompleto');
        }
        const isComplete = details.every((detail) =>
          Number(detail.receivedQuantity) >= Number(detail.plannedQuantity)
          && detail.stage !== ProductionDetailStage.CANCELLED);
        if (isComplete) {
          throw new ConflictException('La orden está completa; utilice el cierre normal');
        }
        const now = new Date();
        for (const detail of details) {
          if (![ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT, ProductionDetailStage.CANCELLED].includes(detail.stage)) {
            detail.stage = ProductionDetailStage.CANCELLED;
            detail.canceledById = actor.id;
            detail.canceledAt = now;
            detail.completedAt = now;
            detail.cancellationReason = reason;
          }
        }
        await manager.getRepository(ProductionConsolidationDetail).save(details);
        const previousStatus = consolidation.status;
        consolidation.status = ProductionConsolidationStatus.CLOSED_INCOMPLETE;
        consolidation.incompleteCloseObservation = reason;
        consolidation.closedById = actor.id;
        consolidation.closedAt = now;
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.closeStockRequestIncomplete(manager, id, actor.id, reason);
        await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CLOSED_INCOMPLETE, ProductionHistoryEvent.INCOMPLETE_CLOSE, actor.id, reason);
        await this.saveAudit(manager, actor.id, 'CERRAR_PRODUCCION_INCOMPLETA', id, {
          reason,
          plannedQuantity: details.reduce((sum, detail) => sum + Number(detail.plannedQuantity), 0),
          receivedQuantity: details.reduce((sum, detail) => sum + Number(detail.receivedQuantity), 0),
        });
      });
      return this.findOne(id, actor);
    }

  async close(
      id: string,
      dto: CloseProductionConsolidationDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
        if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(consolidation.status)) {
          throw new ConflictException('Solo un requerimiento Emitido o En proceso puede cerrarse');
        }
        const details = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .setLock('pessimistic_write')
          .where('detail.consolidationId = :id', { id })
          .orderBy('detail.id', 'ASC')
          .getMany();
        if (!details.length) throw new UnprocessableEntityException('La consolidación no tiene detalles');
        const areaIds = this.productionAreaScope(actor);
        if (areaIds && !details.some((detail) => detail.productionAreaId && areaIds.includes(detail.productionAreaId))) {
          throw new ForbiddenException('La orden no contiene productos de las áreas de Producción asignadas al usuario');
        }
        const terminalStages = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
        if (details.some((detail) => !terminalStages.includes(detail.stage))) {
          throw new UnprocessableEntityException('No se puede cerrar la orden hasta que Almacén reciba la entrega final de cada producto');
        }
        if (details.some((detail) => Number(detail.receivedQuantity) < Number(detail.plannedQuantity))) {
          throw new UnprocessableEntityException('Existen cantidades pendientes; utilice el cierre incompleto e indique el motivo');
        }
        const hasDifference = details.some((detail) => Number(detail.difference) !== 0);
        const observation = dto.observation?.trim() || null;
        if (hasDifference && !observation) {
          throw new UnprocessableEntityException('Debe registrar una observación para cerrar con faltante o excedente');
        }
        const previousStatus = consolidation.status;
        consolidation.status = ProductionConsolidationStatus.CLOSED;
        consolidation.closedById = actor.id;
        consolidation.closedAt = new Date();
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.closeStockRequest(manager, consolidation.id, actor.id);
        await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.CLOSED, ProductionHistoryEvent.CLOSE, actor.id, observation || 'Requerimiento cerrado sin diferencias');
        await this.saveAudit(manager, actor.id, 'CERRAR_CONSOLIDACION', id, { hasDifference, observation });
      });
      return this.findOne(id, actor);
    }

  async history(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationHistory[]> {
      await this.findOne(id, actor);
      return this.historyRepository.createQueryBuilder('history')
        .leftJoinAndSelect('history.user', 'user')
        .where('history.consolidationId = :id', { id })
        .orderBy('history.occurredAt', 'ASC')
        .addOrderBy(`CASE "history"."evento"
          WHEN 'GENERACION' THEN 1
          WHEN 'RECALCULO' THEN 2
          WHEN 'AJUSTE_LOTE' THEN 3
          WHEN 'PRODUCCION_ADICIONAL' THEN 3
          WHEN 'PRODUCTO_AGREGADO' THEN 3
          WHEN 'PRODUCTO_RETIRADO' THEN 3
          WHEN 'PROGRAMACION' THEN 3
          WHEN 'EMISION' THEN 4
          WHEN 'INICIO' THEN 5
          WHEN 'AVANCE' THEN 6
          WHEN 'ENTREGA_PRODUCCION' THEN 7
          WHEN 'RECEPCION_ALMACEN' THEN 8
          WHEN 'CANCELACION_PRODUCTO' THEN 8
          WHEN 'CANCELACION_ORDEN' THEN 9
          WHEN 'CIERRE_INCOMPLETO' THEN 9
          WHEN 'CIERRE' THEN 9
          ELSE 99 END`, 'ASC')
        .addOrderBy('history.id', 'ASC')
        .getMany();
    }
}
