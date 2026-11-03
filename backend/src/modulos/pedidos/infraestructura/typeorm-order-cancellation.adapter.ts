import { workflowTransaction } from '../order-workflow';
import { ConflictException, NotFoundException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { AuditEvent } from '../../seguridad/auditoria/entidades/audit-event.entity';
import { InventoryReservation } from '../../almacen/entidades/inventory-reservation.entity';
import { InventoryReservationStatus } from '../../almacen/entidades/inventory.enums';
import { Stock } from '../../almacen/entidades/stock.entity';

import { CancelOrderInput, RemoveOrderInput } from '../aplicacion/puertos/order-cancellation.port';
import { OrderCancellationPort } from '../aplicacion/puertos/order-cancellation.port';
@Injectable()
export class TypeOrmOrderCancellationAdapter extends OrderCancellationPort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }
  async cancel(id: string, input: CancelOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status === OrderStatus.CANCELED) throw new ConflictException('El pedido ya está cancelado');
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED, OrderStatus.CONFIRMED].includes(order.status)) {
        throw new ConflictException('El pedido no puede cancelarse en su estado actual');
      }
      const previousStatus = order.status;
      let releasedQuantity = 0;
      if (previousStatus === OrderStatus.CONFIRMED) {
        const downstream = await manager.query<
          Array<{ has_preparation: boolean; has_delivery: boolean; has_sale: boolean }>
        >(
          `
            SELECT
              EXISTS (SELECT 1 FROM preparaciones_pedido WHERE pedido_id = $1) AS has_preparation,
              EXISTS (SELECT 1 FROM rutas_entregas WHERE pedido_id = $1) AS has_delivery,
              EXISTS (SELECT 1 FROM ventas WHERE pedido_id = $1) AS has_sale
          `,
          [id],
        );
        if (downstream[0]?.has_preparation || downstream[0]?.has_delivery || downstream[0]?.has_sale) {
          throw new ConflictException(
            'El pedido ya tiene preparación, entrega o venta asociada y no puede cancelarse desde Pedidos',
          );
        }

        const reservations = await manager
          .getRepository(InventoryReservation)
          .createQueryBuilder('reservation')
          .innerJoin(OrderDetail, 'detail', 'detail.id = reservation.orderDetailId')
          .setLock('pessimistic_write')
          .where('detail.orderId = :id', { id })
          .orderBy('reservation.stockId', 'ASC')
          .getMany();
        if (reservations.some((reservation) => reservation.status === InventoryReservationStatus.CONSUMED)) {
          throw new ConflictException('El pedido tiene inventario despachado y no puede cancelarse desde Pedidos');
        }
        if (reservations.some((reservation) => reservation.status !== InventoryReservationStatus.ACTIVE)) {
          throw new ConflictException('Las reservas del pedido ya no se encuentran disponibles para liberación');
        }
        for (const reservation of reservations) {
          const stock = await manager
            .getRepository(Stock)
            .createQueryBuilder('stock')
            .setLock('pessimistic_write')
            .where('stock.id = :id', { id: reservation.stockId })
            .getOneOrFail();
          const quantity = Number(reservation.quantity);
          const nextReserved = Number(stock.reservedQuantity) - quantity;
          if (nextReserved < -0.0005) throw new ConflictException('El saldo reservado cambió durante la cancelación');
          stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
          await manager.getRepository(Stock).save(stock);
          reservation.status = InventoryReservationStatus.RELEASED;
          await manager.getRepository(InventoryReservation).save(reservation);
          releasedQuantity += quantity;
        }
        await manager
          .getRepository(OrderDetail)
          .update({ orderId: id }, { reservedQuantity: '0.000', pendingQuantity: '0.000' });
      }

      order.status = OrderStatus.CANCELED;
      order.canceledById = input.actorId;
      order.canceledAt = new Date();
      order.cancellationReason = input.reason;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus,
          newStatus: OrderStatus.CANCELED,
          userId: input.actorId,
          origin: input.origin,
          observation: order.cancellationReason,
        }),
      );
      await manager
        .getRepository(OrderConfirmationLink)
        .update(
          { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
          { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
        );
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          userId: input.actorId,
          module: 'orders',
          action: 'CANCELAR_PEDIDO',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { previousStatus, reason: order.cancellationReason, releasedQuantity: releasedQuantity.toFixed(3) },
        }),
      );
    });
  }
  async remove(id: string, input: RemoveOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status !== OrderStatus.CANCELED) {
        throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
      }
      order.deletedById = input.actorId;
      order.deletionReason = input.reason;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(Order).softDelete(id);
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          userId: input.actorId,
          module: 'orders',
          action: 'ELIMINAR_PEDIDO',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: input.snapshot,
        }),
      );
    });
  }
}
