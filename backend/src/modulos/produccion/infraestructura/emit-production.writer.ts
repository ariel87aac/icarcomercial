import { assertEmissionAllowed } from '../dominio/production-lifecycle.rules';
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
} from '../dominio/production.enums';
import { ProductionDraftValidator } from './production-draft-validator';
import { ProductionTransactionSupport } from './production-transaction-support';
import { EmitProductionWritePort } from '../aplicacion/puertos/emit-production-write.port';
@Injectable()
export class TypeOrmEmitProductionWriter extends EmitProductionWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
    private readonly productionDraftValidator: ProductionDraftValidator,
  ) {
    super();
  }
  async emit(id: string, actor: ProductionActor): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
      assertEmissionAllowed(consolidation.status);
      await this.productionTransactionSupport.lockDeliveryDate(manager, consolidation.deliveryDate);
      await this.productionDraftValidator.validateDraftIntegrity(manager, consolidation);
      await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder()
        .update()
        .set({ stage: ProductionDetailStage.COMPLETED })
        .where('consolidacion_id = :id', { id })
        .andWhere('cantidad_planificada = 0')
        .execute();
      consolidation.status = ProductionConsolidationStatus.ISSUED;
      consolidation.emittedById = actor.id;
      consolidation.emittedAt = new Date();
      await manager.getRepository(ProductionConsolidation).save(consolidation);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        ProductionConsolidationStatus.DRAFT,
        ProductionConsolidationStatus.ISSUED,
        ProductionHistoryEvent.ISSUE,
        actor.id,
        'Requerimiento emitido a Producción',
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'EMITIR_CONSOLIDACION', id, {
        deliveryDate: consolidation.deliveryDate,
        version: consolidation.version,
        type: consolidation.type,
      });
    });
  }
}
