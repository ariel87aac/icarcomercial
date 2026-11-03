import { calculateProductionDelivery } from '../dominio/production-deliveries.rules';
import { assertDeliveryAllowed } from '../dominio/production-deliveries.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { RegisterProductionDeliveryCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import {
  ProductionHistoryEvent,
  ProductionDetailStage,
  ProductionDeliveryStatus,
  ProductionProgressType,
} from '../dominio/production.enums';
import { decimalForScale } from '../dominio/production-calculations';
import { ProductionProgress } from '../entidades/production-progress.entity';
import { ProductionDelivery } from '../entidades/production-delivery.entity';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionTransactionSupport } from './production-transaction-support';
import { ProductionDeliveriesWritePort } from '../aplicacion/puertos/production-deliveries-write.port';
@Injectable()
export class TypeOrmProductionDeliveriesWriter extends ProductionDeliveriesWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async registerDelivery(
    id: string,
    detailId: string,
    dto: RegisterProductionDeliveryCommand,
    actor: ProductionActor,
  ): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const detail = await manager
        .getRepository(ProductionConsolidationDetail)
        .createQueryBuilder('detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.presentation', 'presentation')
        .setLock('pessimistic_write')
        .where('detail.id = :detailId', { detailId })
        .andWhere('detail.consolidationId = :id', { id })
        .getOne();
      if (!detail) throw new ProductionError('missing', 'Producto de la orden no encontrado');
      this.productionAccessPolicy.assertProductionAreaAccess(actor, detail.productionAreaId);
      assertDeliveryAllowed(detail);
      const pendingDelivery = await manager.getRepository(ProductionDelivery).findOne({
        where: { consolidatedDetailId: detail.id, status: ProductionDeliveryStatus.PENDING },
      });
      if (pendingDelivery)
        throw new ProductionError('conflict', 'Este producto ya tiene una entrega pendiente de recepción en Almacén');
      const { scale, quantity, produced, difference, incident } = calculateProductionDelivery(detail, dto);
      const productionFinishedAt = new Date();
      const delivery = await manager.getRepository(ProductionDelivery).save(
        manager.getRepository(ProductionDelivery).create({
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
        }),
      );
      await manager.getRepository(ProductionProgress).save(
        manager.getRepository(ProductionProgress).create({
          consolidatedDetailId: detail.id,
          quantity: decimalForScale(quantity, scale),
          type: ProductionProgressType.PROGRESS,
          userId: actor.id,
          observation:
            incident || (dto.finalDelivery ? 'Entrega final enviada a Almacén' : 'Entrega parcial enviada a Almacén'),
        }),
      );
      detail.preparedQuantity = decimalForScale(produced, scale);
      detail.difference = decimalForScale(difference, scale);
      detail.stage = ProductionDetailStage.PENDING_RECEIPT;
      if (dto.finalDelivery) detail.completedAt = productionFinishedAt;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.productionTransactionSupport.saveHistory(
        manager,
        id,
        detail.consolidation.status,
        detail.consolidation.status,
        ProductionHistoryEvent.DELIVERY,
        actor.id,
        `${detail.product.name}: ${decimalForScale(quantity, scale)} ${detail.presentation.description} entregados${dto.finalDelivery ? ' (entrega final)' : ' (entrega parcial)'}. Fin de producción: ${productionFinishedAt.toISOString()}${incident ? `. Incidencia: ${incident}` : ''}`,
      );
      await this.productionTransactionSupport.saveAudit(manager, actor.id, 'ENTREGAR_PRODUCTO_A_ALMACEN', id, {
        deliveryId: delivery.id,
        consolidatedDetailId: detail.id,
        quantity,
        finalDelivery: dto.finalDelivery,
        difference,
        productionFinishedAt: productionFinishedAt.toISOString(),
      });
    });
  }
}
