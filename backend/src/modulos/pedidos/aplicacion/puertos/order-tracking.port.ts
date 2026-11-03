import type { Order } from '../../entidades/order.entity';
import type { OrderTrackingView } from '../order-tracking.view';

export abstract class OrderTrackingPort {
  abstract ensureOrderLink(order: Order): Promise<string>;
  abstract safeCaptureOrder(orderId: string, sourceEvent: string, notify?: boolean): Promise<void>;
  abstract refreshStock(sourceEvent: string): Promise<void>;
  abstract orderSnapshot(orderId: string): Promise<OrderTrackingView>;
}
