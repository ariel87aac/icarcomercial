import { workflowTransaction } from '../order-workflow';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderDetail } from '../entidades/order-detail.entity';
import { OrderHistory } from '../entidades/order-history.entity';
import { Order } from '../entidades/order.entity';
import { OrderStatus, OrderConfirmationLinkStatus, OrderOrigin } from '../entidades/order.enums';
import { OrderConfirmationLink } from '../entidades/order-confirmation-link.entity';

import { SendOrderInput, ReturnOrderInput } from '../aplicacion/puertos/order-submission.port';
import { OrderSubmissionPort } from '../aplicacion/puertos/order-submission.port';
@Injectable()
export class TypeOrmOrderSubmissionAdapter extends OrderSubmissionPort {
  constructor(private readonly dataSource: DataSource) {
    super();
  }
  async send(id: string, input: SendOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (order.status !== OrderStatus.DRAFT) throw new ConflictException('El pedido ya cambió de estado');
      order.status = OrderStatus.RECEIVED;
      order.receivedAt = new Date();
      order.total = input.total;
      await manager.getRepository(Order).save(order);
      for (const detail of input.details) {
        const { presentationId: _presentationId, ...values } = detail;
        await manager.getRepository(OrderDetail).update({ orderId: id, presentationId: detail.presentationId }, values);
      }
      await manager.getRepository(OrderConfirmationLink).update(
        { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
        {
          status: OrderConfirmationLinkStatus.REVOKED,
          revokedAt: new Date(),
        },
      );
      await manager.getRepository(OrderConfirmationLink).save(
        manager.getRepository(OrderConfirmationLink).create({
          orderId: id,
          tokenHash: input.tokenHash,
          status: OrderConfirmationLinkStatus.ACTIVE,
          expiresAt: input.expiresAt,
          createdById: input.actorId,
          usedAt: null,
          revokedAt: null,
        }),
      );
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: OrderStatus.DRAFT,
          newStatus: OrderStatus.RECEIVED,
          userId: input.actorId,
          origin: input.origin,
          observation: input.observation,
        }),
      );
    });
  }
  async returnToDraft(id: string, input: ReturnOrderInput): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (order.status !== OrderStatus.RECEIVED) throw new ConflictException('El pedido ya cambió de estado');
      order.status = OrderStatus.DRAFT;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderConfirmationLink).update(
        { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
        {
          status: OrderConfirmationLinkStatus.REVOKED,
          revokedAt: new Date(),
        },
      );
      await manager.getRepository(OrderHistory).save(
        manager.getRepository(OrderHistory).create({
          orderId: id,
          previousStatus: OrderStatus.RECEIVED,
          newStatus: OrderStatus.DRAFT,
          userId: input.actorId,
          origin: OrderOrigin.INTERNAL,
          observation: input.observation,
        }),
      );
    });
  }
}
