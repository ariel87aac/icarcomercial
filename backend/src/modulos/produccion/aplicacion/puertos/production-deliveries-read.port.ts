import type { ProductionDeliveryView } from '../modelos/production-delivery.view';

export abstract class ProductionDeliveriesReadPort {
  abstract pendingDeliveries(): Promise<ProductionDeliveryView[]>;
  abstract findReceived(id: string): Promise<ProductionDeliveryView>;
}
