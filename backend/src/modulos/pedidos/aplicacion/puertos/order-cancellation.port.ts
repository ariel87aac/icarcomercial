import { OrderOrigin, OrderStatus } from '../../entidades/order.enums';

export interface CancelOrderInput {
  actorId: string;
  origin: OrderOrigin;
  reason: string;
}

export interface RemoveOrderInput {
  actorId: string;
  reason: string;
  snapshot: { code: string; customerId: string; status: OrderStatus; total: string; reason: string };
}

/** Conserva bloqueos, liberación de reservas e historial en una sola transacción. */
export abstract class OrderCancellationPort {
  abstract cancel(id: string, input: CancelOrderInput): Promise<void>;
  abstract remove(id: string, input: RemoveOrderInput): Promise<void>;
}
