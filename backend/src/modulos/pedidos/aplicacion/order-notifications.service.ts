import { Injectable } from '@nestjs/common';
import { Order } from '../entidades/order.entity';
import { NotificationEvent } from '../../seguimiento-mensajeria/entidades/tracking.enums';
import { OrderTrackingPort } from './puertos/order-tracking.port';
import { OrderMessagingPort } from './puertos/order-messaging.port';

@Injectable()
export class OrderNotificationsService {
  constructor(
    private readonly notificationService: OrderMessagingPort,
    private readonly trackingService: OrderTrackingPort,
  ) {}

  async afterConfirmation(order: Order, notificationOwnerId: string, sourceEvent: string): Promise<void> {
    await this.notificationService.safeEnqueueOrderLifecycle(
      order,
      NotificationEvent.ORDER_CONFIRMED,
      notificationOwnerId,
      { productList: this.productList(order), trackingUrl: await this.trackingService.ensureOrderLink(order) },
    );
    await this.trackingService.safeCaptureOrder(order.id, sourceEvent);
    await this.trackingService.refreshStock(`stock.confirm:${order.id}`);
  }

  productList(order: Order): string {
    return order.details
      .map(
        (detail) =>
          `- ${detail.productDescriptionSnapshot} · ${detail.presentationDescriptionSnapshot}: ${Number(detail.requestedQuantity)} ${detail.unitAbbreviationSnapshot}`,
      )
      .join('\n');
  }
}
