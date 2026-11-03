import type { orderDetailValues } from '../../dominio/order-detail-values';
import { OrderOrigin } from '../../entidades/order.enums';

export type DraftDetailInput = ReturnType<typeof orderDetailValues> & { presentationId: string };

interface DraftValues {
  addressId: string;
  requestedDate: string;
  orderCutoffAt: Date;
  preparationAt: Date;
  total: string;
  details: DraftDetailInput[];
}

export interface CreateDraftInput extends DraftValues {
  customerId: string;
  origin: OrderOrigin;
  actorId: string;
  observations: string | null;
}

export interface UpdateDraftInput extends DraftValues {
  scheduleChanged: boolean;
  observations?: string | null;
}

/** Guarda cabecera y detalles atómicamente; update revalida el estado bajo bloqueo. */
export abstract class OrderDraftWritePort {
  abstract create(input: CreateDraftInput): Promise<string>;
  abstract update(id: string, input: UpdateDraftInput): Promise<void>;
}
