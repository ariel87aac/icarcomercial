import { OrderOrigin } from '../../entidades/order.enums';

export interface RescheduleOrderInput {
  deliveryDate: string;
  actorId: string;
  origin: OrderOrigin;
}

/** Revalida estado, plazo y detalles dentro de la transacción. */
export abstract class OrderReschedulePort {
  abstract reschedule(id: string, input: RescheduleOrderInput): Promise<void>;
}
