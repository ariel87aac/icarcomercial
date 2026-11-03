import type { OrderConfirmationLink } from '../../entidades/order-confirmation-link.entity';

export abstract class OrderLinkPort {
  abstract findByHash(tokenHash: string): Promise<OrderConfirmationLink | null>;
  abstract save(link: OrderConfirmationLink): Promise<void>;
}
