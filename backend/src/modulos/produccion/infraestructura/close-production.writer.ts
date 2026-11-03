import { validateProductionClosure } from '../dominio/production-close.rules';
import { assertCloseStatus } from '../dominio/production-lifecycle.rules';
import { assertIncompleteCloseStatus } from '../dominio/production-lifecycle.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { CloseProductionConsolidationCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import {
  ProductionConsolidationStatus,
  ProductionHistoryEvent,
  ProductionDetailStage,
  ProductionDeliveryStatus,
} from '../dominio/production.enums';
import { ProductionDelivery } from '../entidades/production-delivery.entity';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionTransactionSupport } from './production-transaction-support';
import { CloseProductionWritePort } from '../aplicacion/puertos/close-production-write.port';
@Injectable()
export class TypeOrmCloseProductionWriter extends CloseProductionWritePort {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly dataSource: DataSource,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async closeIncomplete(id: string, actor: ProductionActor, reason: string): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Orden de Producción no encontrada');
      assertIncompleteCloseStatus(consolidation.status);
      const details = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .getMany();
      if (!details.length) throw new ProductionError('inconsistent', 'La orden no tiene productos');
      this.productionAccessPolicy.assertWholeOrderAccess(actor, details);
      const pendingDeliveries = await manager
        .getRepository(ProductionDelivery)
        .createQueryBuilder('delivery')
        .innerJoin('delivery.consolidatedDetail', 'detail')
        .where('detail.consolidationId = :id', { id })
        .andWhere('delivery.status = :status', { status: ProductionDeliveryStatus.PENDING })
        .getCount();
      if (pendingDeliveries) {
        throw new ProductionError(
          'conflict',
          'Almacén debe resolver todas las entregas pendientes antes del cierre incompleto',
        );
      }
      const isComplete = details.every(
        (detail) =>
          Number(detail.receivedQuantity) >= Number(detail.plannedQuantity) &&
          detail.stage !== ProductionDetailStage.CANCELLED,
      );
      if (isComplete) {
        throw new ProductionError('conflict', 'La orden está completa; utilice el cierre normal');
      }
      const now = new Date();
      for (const detail of details) {
        if (
          ![
            ProductionDetailStage.COMPLETED,
            ProductionDetailStage.CLOSED_WITH_INCIDENT,
            ProductionDetailStage.CANCELLED,
          ].includes(detail.stage)
        ) {
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
      await this.productionTransactionSupport.closeStockRequestIncomplete(manager, id, actor.id, reason);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        previousStatus,
        ProductionConsolidationStatus.CLOSED_INCOMPLETE,
        ProductionHistoryEvent.INCOMPLETE_CLOSE,
        actor.id,
        reason,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'CERRAR_PRODUCCION_INCOMPLETA', id, {
        reason,
        plannedQuantity: details.reduce((sum, detail) => sum + Number(detail.plannedQuantity), 0),
        receivedQuantity: details.reduce((sum, detail) => sum + Number(detail.receivedQuantity), 0),
      });
    });
  }
  async close(id: string, dto: CloseProductionConsolidationCommand, actor: ProductionActor): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
      assertCloseStatus(consolidation.status);
      const details = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .orderBy('detail.id', 'ASC')
        .getMany();
      if (!details.length) throw new ProductionError('inconsistent', 'La consolidación no tiene detalles');
      const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
      if (areaIds && !details.some((detail) => detail.productionAreaId && areaIds.includes(detail.productionAreaId))) {
        throw new ProductionError(
          'forbidden',
          'La orden no contiene productos de las áreas de Producción asignadas al usuario',
        );
      }
      const { hasDifference, observation } = validateProductionClosure(details, dto.observation);
      const previousStatus = consolidation.status;
      consolidation.status = ProductionConsolidationStatus.CLOSED;
      consolidation.closedById = actor.id;
      consolidation.closedAt = new Date();
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.productionTransactionSupport.closeStockRequest(manager, consolidation.id, actor.id);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        previousStatus,
        ProductionConsolidationStatus.CLOSED,
        ProductionHistoryEvent.CLOSE,
        actor.id,
        observation || 'Requerimiento cerrado sin diferencias',
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'CERRAR_CONSOLIDACION', id, {
        hasDifference,
        observation,
      });
    });
  }
}
