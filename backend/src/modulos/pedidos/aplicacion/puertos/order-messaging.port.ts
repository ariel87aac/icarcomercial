import type { Order } from '../../entidades/order.entity';
import { NotificationEvent } from '../../../seguimiento-mensajeria/entidades/tracking.enums';

export interface OrderMessageVariables {
  productList?: string;
  trackingUrl?: string;
  confirmationUrl?: string;
  cancellationReason?: string;
}

export abstract class OrderMessagingPort {
  abstract safeEnqueueOrderLifecycle(
    order: Order,
    event: NotificationEvent.ORDER_RECEIVED | NotificationEvent.ORDER_CONFIRMED | NotificationEvent.ORDER_CANCELED,
    createdById: string,
    variables: OrderMessageVariables,
    transitionKey?: string,
  ): Promise<void>;
}
