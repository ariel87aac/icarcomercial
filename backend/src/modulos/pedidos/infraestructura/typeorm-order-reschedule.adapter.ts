import { TypeOrmOrderValidationAdapter } from './typeorm-order-validation.adapter';
import { workflowTransaction } from '../order-workflow';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { AuditEvent } from '../../seguridad/auditoria/entidades/audit-event.entity';
import { OrderDetailsService } from '../aplicacion/order-details.service';

import { RescheduleOrderInput } from '../aplicacion/puertos/order-reschedule.port';
import { OrderReschedulePort } from '../aplicacion/puertos/order-reschedule.port';
@Injectable()
export class TypeOrmOrderRescheduleAdapter extends OrderReschedulePort {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderDetailsService: OrderDetailsService,
    private readonly validation: TypeOrmOrderValidationAdapter,
  ) {
    super();
  }
  async reschedule(id: string, input: RescheduleOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(order.status)) {
        throw new ConflictException('El pedido ya no admite reprogramación');
      }
      if (new Date(order.orderCutoffAt).getTime() > Date.now()) {
        throw new ConflictException('El pedido ya fue reprogramado o todavía se encuentra dentro del plazo');
      }

      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id } });
      const previousRequestedDate = order.requestedDate;
      const { items, schedule } = await this.orderDetailsService.validateOrder(
        order.customerId,
        order.addressId,
        input.deliveryDate,
        details.map((detail) => ({
          presentationId: detail.presentationId,
          quantity: Number(detail.requestedQuantity),
        })),
        this.validation.forTransaction(manager),
      );
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      order.requestedDate = input.deliveryDate;
      order.orderCutoffAt = schedule.orderCutoffAt;
      order.preparationAt = schedule.preparationAt;
      order.total = total.toFixed(2);
      await manager.getRepository(Order).save(order);
      await manager
        .getRepository(OrderConfirmationLink)
        .update({ orderId: id, status: OrderConfirmationLinkStatus.ACTIVE }, { expiresAt: schedule.orderCutoffAt });
      await manager.getRepository(OrderDetail).delete({ orderId: id });
      await manager
        .getRepository(OrderDetail)
        .save(
          items.map((item) =>
            manager
              .getRepository(OrderDetail)
              .create({
                orderId: id,
                presentationId: item.presentation.id,
                ...this.orderDetailsService.detailValues(item),
              }),
          ),
        );
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: order.status,
          newStatus: order.status,
          userId: input.actorId,
          origin: input.origin,
          observation: `Pedido reprogramado de ${previousRequestedDate} a ${input.deliveryDate} por cierre vencido`,
        }),
      );
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          userId: input.actorId,
          module: 'orders',
          action: 'REPROGRAMAR_PEDIDO_SIGUIENTE_FECHA',
          entity: 'pedidos',
          entityId: id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: {
            previousRequestedDate,
            requestedDate: input.deliveryDate,
            orderCutoffAt: schedule.orderCutoffAt,
            preparationAt: schedule.preparationAt,
          },
        }),
      );
    });
  }
}
