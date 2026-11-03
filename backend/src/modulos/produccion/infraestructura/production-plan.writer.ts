import { assertScheduleEditable } from '../dominio/production-lifecycle.rules';
import { assertPlanEditable } from '../dominio/production-lifecycle.rules';
import { scheduleProductionDetail } from '../dominio/production-plan.rules';
import { adjustProductionPlan } from '../dominio/production-plan.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { AdjustProductionPlanCommand, ScheduleProductionDetailCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { ProductionConsolidationStatus, ProductionHistoryEvent } from '../dominio/production.enums';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionTransactionSupport } from './production-transaction-support';
import { ProductionPlanWritePort } from '../aplicacion/puertos/production-plan-write.port';
@Injectable()
export class TypeOrmProductionPlanWriter extends ProductionPlanWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async adjustPlan(
    id: string,
    detailId: string,
    dto: AdjustProductionPlanCommand,
    actor: ProductionActor,
  ): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
      assertPlanEditable(consolidation.status);
      const detail = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new ProductionError('missing', 'Detalle consolidado no encontrado');
      this.productionAccessPolicy.assertProductionAreaAccess(actor, detail.productionAreaId);
      const { previousPlanned, adjustment } = adjustProductionPlan(detail, dto);
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      const observation =
        adjustment > 0
          ? `${detail.product.name}: plan actualizado de ${previousPlanned} a ${detail.plannedQuantity}; ajuste por batch/capacidad ${detail.additionalProductionQuantity}${detail.additionalProductionReason ? ` (${detail.additionalProductionReason})` : ''}`
          : `${detail.product.name}: ajuste por batch/capacidad retirado; plan ${detail.plannedQuantity}`;
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.ADDITIONAL_PRODUCTION,
        actor.id,
        observation,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'AJUSTAR_PLAN_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        productId: detail.productId,
        productionRequiredQuantity: detail.productionRequiredQuantity,
        stockRequestedQuantity: detail.stockRequestedQuantity,
        previousPlannedQuantity: previousPlanned,
        plannedQuantity: detail.plannedQuantity,
        additionalProductionQuantity: detail.additionalProductionQuantity,
        reason: detail.additionalProductionReason,
      });
    });
  }
  async scheduleDetail(
    id: string,
    detailId: string,
    dto: ScheduleProductionDetailCommand,
    actor: ProductionActor,
  ): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Orden de Producción no encontrada');
      assertScheduleEditable(consolidation.status);
      const detail = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.product', 'product')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new ProductionError('missing', 'Producto de la orden no encontrado');
      this.productionAccessPolicy.assertProductionAreaAccess(actor, detail.productionAreaId);
      const { previous } = scheduleProductionDetail(detail, dto);
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.DRAFT,
        ProductionHistoryEvent.SCHEDULING,
        actor.id,
        `${detail.product.name}: programado para ${dto.scheduledDate}, secuencia ${dto.sequence}, plan ${detail.plannedQuantity}`,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'PROGRAMAR_PRODUCTO_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        previous,
        scheduledDate: detail.scheduledDate,
        sequence: detail.sequence,
        additionalProductionQuantity: detail.additionalProductionQuantity,
        plannedQuantity: detail.plannedQuantity,
        reason: detail.additionalProductionReason,
      });
    });
  }
}
