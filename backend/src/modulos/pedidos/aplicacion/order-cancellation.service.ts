import { OrderCancellationPort } from './puertos/order-cancellation.port';
import { ConflictException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { CancelOrderDto, DeleteOrderDto } from '../dto/order.dto';
import { Order } from '../entidades/order.entity';
import { OrderStatus } from '../entidades/order.enums';
import { NotificationEvent } from '../../seguimiento-mensajeria/entidades/tracking.enums';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderMessagingPort } from './puertos/order-messaging.port';
import { OrderAccessService } from './order-access.service';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderQueriesService } from './order-queries.service';

@Injectable()
export class OrderCancellationService {
  constructor(
    private readonly orderQueriesService: OrderQueriesService,
    private readonly cancellation: OrderCancellationPort,
    private readonly orderAccessService: OrderAccessService,
    private readonly trackingService: OrderTrackingPort,
    private readonly notificationService: OrderMessagingPort,
    private readonly orderNotificationsService: OrderNotificationsService,
  ) {}

  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser): Promise<Order> {
    await this.orderQueriesService.findOne(id, actor);
    await this.cancellation.cancel(id, {
      actorId: actor.id,
      origin: this.orderAccessService.origin(actor),
      reason: dto.reason.trim(),
    });
    const canceled = await this.orderQueriesService.findOne(id, actor);
    await this.trackingService.safeCaptureOrder(id, `order.canceled:${id}`, false);
    await this.trackingService.refreshStock(`stock.cancel:${id}`);
    await this.notificationService.safeEnqueueOrderLifecycle(canceled, NotificationEvent.ORDER_CANCELED, actor.id, {
      trackingUrl: await this.trackingService.ensureOrderLink(canceled),
      productList: this.orderNotificationsService.productList(canceled),
      cancellationReason: canceled.cancellationReason ?? dto.reason.trim(),
    });
    return canceled;
  }

  async remove(
    id: string,
    dto: DeleteOrderDto,
    actor: AuthenticatedUser,
  ): Promise<{ id: string; code: string; deleted: true }> {
    const current = await this.orderQueriesService.findOne(id, actor);
    if (current.status !== OrderStatus.CANCELED) {
      throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
    }
    const snapshot = {
      code: current.code,
      customerId: current.customerId,
      status: current.status,
      total: current.total,
      reason: dto.reason.trim(),
    };
    await this.cancellation.remove(id, { actorId: actor.id, reason: dto.reason.trim(), snapshot });
    return { id, code: current.code, deleted: true };
  }
}
