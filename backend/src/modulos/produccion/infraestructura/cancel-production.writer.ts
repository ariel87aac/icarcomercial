import { assertNoReceivedProducts } from '../dominio/production-lifecycle.rules';
import { assertCancelStatus } from '../dominio/production-lifecycle.rules';
import { assertCancelDetailStage } from '../dominio/production-lifecycle.rules';
import { assertCancelDetailStatus } from '../dominio/production-lifecycle.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
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
import { CancelProductionWritePort } from '../aplicacion/puertos/cancel-production-write.port';
@Injectable()
export class TypeOrmCancelProductionWriter extends CancelProductionWritePort {
  constructor(
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly dataSource: DataSource,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async cancelDetail(id: string, detailId: string, actor: ProductionActor, reason: string): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const detail = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new ProductionError('missing', 'Producto de la orden no encontrado');
      this.productionAccessPolicy.assertProductionAreaAccess(actor, detail.productionAreaId);
      assertCancelDetailStatus(detail.consolidation.status);
      assertCancelDetailStage(detail.stage);
      const pendingDeliveries = await manager.getRepository(ProductionDelivery).count({
        where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
      });
      if (pendingDeliveries) {
        throw new ProductionError(
          'conflict',
          'Almacén debe recibir la entrega pendiente antes de cancelar este producto',
        );
      }
      detail.stage = ProductionDetailStage.CANCELLED;
      detail.canceledById = actor.id;
      detail.canceledAt = new Date();
      detail.completedAt = detail.canceledAt;
      detail.cancellationReason = reason;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        detail.consolidation.status,
        detail.consolidation.status,
        ProductionHistoryEvent.PRODUCT_CANCELLATION,
        actor.id,
        `${detail.product.name}: ${reason}`,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'CANCELAR_PRODUCTO_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        reason,
        preparedQuantity: detail.preparedQuantity,
        receivedQuantity: detail.receivedQuantity,
      });
    });
  }
  async cancel(id: string, actor: ProductionActor, reason: string): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Orden de Producción no encontrada');
      assertCancelStatus(consolidation.status);
      const details = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.consolidationId = :id', { id })
        .getMany();
      this.productionAccessPolicy.assertWholeOrderAccess(actor, details);
      assertNoReceivedProducts(details);
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
          'Almacén debe resolver las entregas pendientes antes de cancelar la orden',
        );
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
      await this.productionTransactionSupport.closeStockRequestIncomplete(
        manager,
        id,
        actor.id,
        `Producción cancelada: ${reason}`,
      );
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        previousStatus,
        ProductionConsolidationStatus.CANCELLED,
        ProductionHistoryEvent.ORDER_CANCELLATION,
        actor.id,
        reason,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'CANCELAR_ORDEN_PRODUCCION', id, { reason });
    });
  }
}
