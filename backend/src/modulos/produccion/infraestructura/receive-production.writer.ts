import { calculateProductionReceipt } from '../dominio/receive-production.rules';
import { ProductionError } from '../dominio/production-error';
import { workflowTransaction } from '../../pedidos/order-workflow';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ReceiveProductionDeliveryCommand } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionHistoryEvent, ProductionDetailStage, ProductionDeliveryStatus } from '../dominio/production.enums';
import { InventoryMovementType } from '../../almacen/entidades/inventory.enums';
import { decimalForScale, roundForScale } from '../dominio/production-calculations';
import { ProductionDelivery } from '../entidades/production-delivery.entity';
import { InventoryMovement } from '../../almacen/entidades/inventory-movement.entity';
import { Stock } from '../../almacen/entidades/stock.entity';
import { ProductionTransactionSupport } from './production-transaction-support';
import { ReceiveProductionWritePort } from '../aplicacion/puertos/receive-production-write.port';
@Injectable()
export class TypeOrmReceiveProductionWriter extends ReceiveProductionWritePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productionTransactionSupport: ProductionTransactionSupport,
  ) {
    super();
  }
  async receiveDelivery(id: string, dto: ReceiveProductionDeliveryCommand, actor: ProductionActor): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const delivery = await manager
        .getRepository(ProductionDelivery)
        .createQueryBuilder('delivery')
        .innerJoinAndSelect('delivery.consolidatedDetail', 'detail')
        .innerJoinAndSelect('detail.consolidation', 'consolidation')
        .innerJoinAndSelect('detail.product', 'product')
        .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
        .innerJoinAndSelect('detail.presentation', 'presentation')
        .setLock('pessimistic_write')
        .where('delivery.id = :id', { id })
        .getOne();
      if (!delivery) throw new ProductionError('missing', 'Entrega de Producción no encontrada');
      const { scale, received, observation } = calculateProductionReceipt(delivery, dto);
      const detail = delivery.consolidatedDetail;
      const stockRepository = manager.getRepository(Stock);
      let stock = await stockRepository
        .createQueryBuilder('stock')
        .setLock('pessimistic_write')
        .where('stock.presentationId = :presentationId', { presentationId: detail.presentationId })
        .getOne();
      if (!stock) {
        stock = await stockRepository.save(
          stockRepository.create({
            presentationId: detail.presentationId!,
            physicalQuantity: '0.000000',
            reservedQuantity: '0.000000',
          }),
        );
      }
      const previousBalance = Number(stock.physicalQuantity);
      const newBalance = roundForScale(previousBalance + received, 6);
      stock.physicalQuantity = decimalForScale(newBalance, 6);
      await stockRepository.save(stock);
      await manager.getRepository(InventoryMovement).save(
        manager.getRepository(InventoryMovement).create({
          stockId: stock.id,
          type: InventoryMovementType.PRODUCTION_IN,
          quantity: decimalForScale(received, 6),
          previousBalance: decimalForScale(previousBalance, 6),
          newBalance: decimalForScale(newBalance, 6),
          reason: `Recepción de Producción: ${detail.product.name} · ${detail.presentation!.description}`,
          userId: actor.id,
          orderId: null,
          orderDetailId: null,
          routeDeliveryId: null,
          productionDeliveryId: delivery.id,
        }),
      );
      delivery.status = ProductionDeliveryStatus.ACCEPTED;
      delivery.receivedQuantity = decimalForScale(received, scale);
      delivery.receivedById = actor.id;
      delivery.receivedAt = new Date();
      delivery.warehouseObservation = observation;
      await manager.getRepository(ProductionDelivery).save(delivery);
      detail.receivedQuantity = decimalForScale(Number(detail.receivedQuantity) + received, scale);
      detail.stage = delivery.finalDelivery
        ? Number(detail.difference) === 0
          ? ProductionDetailStage.COMPLETED
          : ProductionDetailStage.CLOSED_WITH_INCIDENT
        : ProductionDetailStage.PARTIALLY_RECEIVED;
      if (delivery.finalDelivery) detail.completedAt ??= delivery.deliveredAt;
      await manager.getRepository(ProductionConsolidationDetail).save(detail);
      await this.productionTransactionSupport.saveHistory(
        manager,
        detail.consolidationId,
        detail.consolidation.status,
        detail.consolidation.status,
        ProductionHistoryEvent.WAREHOUSE_RECEIPT,
        actor.id,
        `${detail.product.name}: Almacén recibió ${decimalForScale(received, scale)} ${detail.presentation!.description}${observation ? `. ${observation}` : ''}`,
      );
      await this.productionTransactionSupport.closeIfCompleted(manager, detail.consolidationId, actor.id);
      await this.productionTransactionSupport.saveAudit(
        manager,
        actor.id,
        'RECIBIR_PRODUCCION_EN_ALMACEN',
        delivery.id,
        { consolidatedDetailId: detail.id, receivedQuantity: received, stockId: stock.id },
      );
    });
  }
}
