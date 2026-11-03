import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderDraftWritePort, CreateDraftInput, UpdateDraftInput } from '../aplicacion/puertos/order-draft-write.port';
import { Order } from '../entidades/order.entity';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';
import { OrderStatus, OrderConfirmationLinkStatus } from '../entidades/order.enums';
import { workflowTransaction } from '../order-workflow';

@Injectable()
export class TypeOrmOrderDraftWriteAdapter extends OrderDraftWritePort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }
  async create(input: CreateDraftInput): Promise<string> {
    return workflowTransaction(this.dataSource, async (manager) => {
      const sequence = await manager.query<{ nextval: string }[]>(
        `SELECT nextval('pedidos_codigo_seq')::text AS nextval`,
      );
      const code = sequence[0].nextval;
      const order = await manager.getRepository(Order).save(
        manager.getRepository(Order).create({
          code,
          customerId: input.customerId,
          addressId: input.addressId,
          requestedDate: input.requestedDate,
          orderCutoffAt: input.orderCutoffAt,
          preparationAt: input.preparationAt,
          status: OrderStatus.DRAFT,
          origin: input.origin,
          observations: input.observations,
          total: input.total,
          createdById: input.actorId,
          confirmedById: null,
          canceledById: null,
          receivedAt: null,
          confirmedAt: null,
          canceledAt: null,
          cancellationReason: null,
          customerNameSnapshot: null,
          customerTypeSnapshot: null,
          addressSnapshot: null,
          zoneSnapshot: null,
          distributionWeekdaySnapshot: null,
        }),
      );
      await manager
        .getRepository(OrderDetail)
        .save(
          input.details.map((detail) => manager.getRepository(OrderDetail).create({ orderId: order.id, ...detail })),
        );
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: order.id,
          previousStatus: null,
          newStatus: OrderStatus.DRAFT,
          userId: input.actorId,
          origin: input.origin,
          observation: 'Pedido registrado',
        }),
      );
      return order.id;
    });
  }
  async update(id: string, input: UpdateDraftInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (order.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
      if (order.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
      order.addressId = input.addressId;
      order.requestedDate = input.requestedDate;
      if (input.scheduleChanged) {
        order.orderCutoffAt = input.orderCutoffAt;
        order.preparationAt = input.preparationAt;
        await manager
          .getRepository(OrderConfirmationLink)
          .update({ orderId: id, status: OrderConfirmationLinkStatus.ACTIVE }, { expiresAt: input.orderCutoffAt });
      }
      if (input.observations !== undefined) order.observations = input.observations;
      order.total = input.total;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderDetail).delete({ orderId: id });
      await manager
        .getRepository(OrderDetail)
        .save(input.details.map((detail) => manager.getRepository(OrderDetail).create({ orderId: id, ...detail })));
    });
  }
}
