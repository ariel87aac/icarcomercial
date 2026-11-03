import { assertProgressPlan } from '../dominio/production-lifecycle.rules';
import { assertProgressStatus } from '../dominio/production-lifecycle.rules';
import { assertStartStage } from '../dominio/production-lifecycle.rules';
import { assertStartStatus } from '../dominio/production-lifecycle.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { RegisterProductionProgressCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import {
  ProductionConsolidationStatus,
  ProductionHistoryEvent,
  ProductionDetailStage,
  ProductionProgressType,
} from '../dominio/production.enums';
import { decimalForScale, productionDifference, roundForScale } from '../dominio/production-calculations';
import { ProductionProgress } from '../entidades/production-progress.entity';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionTransactionSupport } from './production-transaction-support';
import { ProductionExecutionWritePort } from '../aplicacion/puertos/production-execution-write.port';
@Injectable()
export class TypeOrmProductionExecutionWriter extends ProductionExecutionWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async startDetail(id: string, detailId: string, actor: ProductionActor): Promise<void> {
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
      assertStartStatus(detail.consolidation.status);
      assertStartStage(detail.stage);
      const previousStatus = detail.consolidation.status;
      detail.stage = ProductionDetailStage.IN_PROGRESS;
      detail.startedAt ??= new Date();
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      if (detail.consolidation.status === ProductionConsolidationStatus.ISSUED) {
        detail.consolidation.status = ProductionConsolidationStatus.IN_PROGRESS;
        await manager.getRepository(ProductionConsolidation).save(detail.consolidation);
        await this.productionTransactionSupport.saveHistory(
          manager,
          id,
          previousStatus,
          ProductionConsolidationStatus.IN_PROGRESS,
          ProductionHistoryEvent.START,
          actor.id,
          `Producción iniciada: ${detail.product.name}`,
        );
      } else {
        await this.productionTransactionSupport.saveHistory(
          manager,
          id,
          previousStatus,
          previousStatus,
          ProductionHistoryEvent.START,
          actor.id,
          `Producción iniciada: ${detail.product.name}`,
        );
      }
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'INICIAR_PRODUCTO_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
      });
    });
  }
  async registerProgress(id: string, dto: RegisterProductionProgressCommand, actor: ProductionActor): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const consolidation = await manager
        .getRepository(ProductionConsolidation)
        .createQueryBuilder('consolidation')
        .setLock('pessimistic_write')
        .where('consolidation.id = :id', { id })
        .getOne();
      if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
      assertProgressStatus(consolidation.status);
      const detail = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId: dto.consolidatedDetailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new ProductionError('missing', 'Detalle consolidado no encontrado');
      this.productionAccessPolicy.assertProductionAreaAccess(actor, detail.productionAreaId);
      const scale = detail.baseUnit.decimalScale;
      assertProgressPlan(detail.plannedQuantity);
      const quantity = roundForScale(dto.quantity, scale);
      if (quantity <= 0)
        throw new ProductionError('invalid', 'La cantidad no es válida para la precisión de la unidad base');
      const previousStatus = consolidation.status;
      await manager.getRepository(ProductionProgress).save(
        manager.getRepository(ProductionProgress).create({
          consolidatedDetailId: detail.id,
          quantity: decimalForScale(quantity, scale),
          type: ProductionProgressType.PROGRESS,
          userId: actor.id,
          observation: dto.observation?.trim() || null,
        }),
      );
      const prepared = roundForScale(Number(detail.preparedQuantity) + quantity, scale);
      detail.preparedQuantity = decimalForScale(prepared, scale);
      detail.difference = decimalForScale(productionDifference(prepared, Number(detail.plannedQuantity), scale), scale);
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      if (consolidation.status === ProductionConsolidationStatus.ISSUED) {
        consolidation.status = ProductionConsolidationStatus.IN_PROGRESS;
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.productionTransactionSupport.saveHistory(
          manager,
          id,
          ProductionConsolidationStatus.ISSUED,
          ProductionConsolidationStatus.IN_PROGRESS,
          ProductionHistoryEvent.START,
          actor.id,
          'Primer avance válido',
        );
      }
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        consolidation.status,
        consolidation.status,
        ProductionHistoryEvent.PROGRESS,
        actor.id,
        dto.observation?.trim() || `Avance de ${decimalForScale(quantity, scale)}`,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'REGISTRAR_AVANCE_PRODUCCION', id, {
        consolidatedDetailId: detail.id,
        quantity: decimalForScale(quantity, scale),
        previousStatus,
        status: consolidation.status,
      });
    });
  }
}
