import { OrderOrigin, OrderStatus } from '../../entidades/order.enums';

export interface ConfirmOrderInput {
  actorId: string | null;
  reservationUserId: string;
  allowedStatuses: OrderStatus[];
  origin: OrderOrigin;
  observation: string;
  action: string;
  confirmationTokenHash?: string;
}

/** Confirma pedido, reservas, enlace e historial en una única transacción. */
export abstract class OrderConfirmationPort {
  abstract confirmOrder(id: string, input: ConfirmOrderInput): Promise<void>;
}
