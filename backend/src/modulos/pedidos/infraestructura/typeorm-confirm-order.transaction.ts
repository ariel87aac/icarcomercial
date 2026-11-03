import { TypeOrmOrderValidationAdapter } from './typeorm-order-validation.adapter';
import { OrderConfirmationPort, ConfirmOrderInput } from '../aplicacion/puertos/order-confirmation.port';
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
import { OrderDetailsService } from '../aplicacion/order-details.service';

@Injectable()
export class TypeOrmConfirmOrderTransaction extends OrderConfirmationPort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderDetailsService: OrderDetailsService,
    private readonly validation: TypeOrmOrderValidationAdapter,
  ) {
    super();
  }

  async confirmOrder(id: string, input: ConfirmOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      let confirmationLink: OrderConfirmationLink | null = null;
      if (input.confirmationTokenHash) {
        confirmationLink = await manager
          .getRepository(OrderConfirmationLink)
          .createQueryBuilder('link')
          .setLock('pessimistic_write')
          .where('link.tokenHash = :tokenHash', { tokenHash: input.confirmationTokenHash })
          .getOne();
        if (
          !confirmationLink ||
          confirmationLink.orderId !== id ||
          confirmationLink.status !== OrderConfirmationLinkStatus.ACTIVE
        ) {
          throw new NotFoundException('El enlace de confirmación no está disponible');
        }
        if (confirmationLink.expiresAt <= new Date()) {
          confirmationLink.status = OrderConfirmationLinkStatus.EXPIRED;
          await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
          throw new ConflictException('El plazo de confirmación del pedido finalizó');
        }
      }
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (!input.allowedStatuses.includes(order.status)) {
        throw new ConflictException(
          input.confirmationTokenHash
            ? 'El pedido ya no puede confirmarse mediante este enlace'
            : 'Solo un pedido Recibido puede confirmarse',
        );
      }
      const previousStatus = order.status;
      const details = await manager
        .getRepository(OrderDetail)
        .find({ where: { orderId: id }, order: { presentationId: 'ASC' } });
      const { customer, address, items, schedule } = await this.orderDetailsService.validateOrder(
        order.customerId,
        order.addressId,
        order.requestedDate,
        details.map((detail) => ({
          presentationId: detail.presentationId,
          quantity: Number(detail.requestedQuantity),
        })),
        this.validation.forTransaction(manager),
      );
      let total = 0;
      for (const item of [...items].sort((a, b) => a.presentation.id.localeCompare(b.presentation.id))) {
        await manager.query(
          `INSERT INTO existencias (presentacion_id, cantidad_fisica, cantidad_reservada)
             VALUES ($1, 0, 0) ON CONFLICT (presentacion_id) DO NOTHING`,
          [item.presentation.id],
        );
        const stock = await manager
          .getRepository(Stock)
          .createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.presentationId = :presentationId', { presentationId: item.presentation.id })
          .getOneOrFail();
        const available = Math.max(0, Number(stock.physicalQuantity) - Number(stock.reservedQuantity));
        const reserved = Math.min(item.quantity, available);
        const pending = item.quantity - reserved;
        stock.reservedQuantity = (Number(stock.reservedQuantity) + item.quantity).toFixed(3);
        await manager.getRepository(Stock).save(stock);
        const detail = details.find((value) => value.presentationId === item.presentation.id)!;
        Object.assign(detail, this.orderDetailsService.detailValues(item), {
          reservedQuantity: reserved.toFixed(3),
          pendingQuantity: pending.toFixed(3),
        });
        await manager.getRepository(OrderDetail).save(detail);
        await manager.getRepository(InventoryReservation).save(
          manager.getRepository(InventoryReservation).create({
            orderDetailId: detail.id,
            stockId: stock.id,
            quantity: item.quantity.toFixed(3),
            status: InventoryReservationStatus.ACTIVE,
            userId: input.reservationUserId,
          }),
        );
        total += item.subtotal;
      }
      order.status = OrderStatus.CONFIRMED;
      order.confirmedById = input.actorId;
      order.confirmedAt = new Date();
      order.total = total.toFixed(2);
      order.customerNameSnapshot = customer.businessName;
      order.customerTypeSnapshot = customer.type;
      order.addressSnapshot = address.address;
      order.zoneSnapshot = address.zone?.name ?? null;
      order.distributionWeekdaySnapshot = schedule.weekday;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus,
          newStatus: OrderStatus.CONFIRMED,
          userId: input.actorId,
          origin: input.origin,
          observation: input.observation,
        }),
      );
      if (confirmationLink) {
        confirmationLink.status = OrderConfirmationLinkStatus.USED;
        confirmationLink.usedAt = new Date();
        await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
      } else {
        await manager
          .getRepository(OrderConfirmationLink)
          .update(
            { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
            { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
          );
      }
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          userId: input.actorId,
          module: 'orders',
          action: input.action,
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { customerId: customer.id, total: total.toFixed(2), origin: input.origin },
        }),
      );
    });
  }
}
