import { OrderOrigin } from '../../entidades/order.enums';
import type { DraftDetailInput } from './order-draft-write.port';

export interface ReturnOrderInput {
  actorId: string;
  observation: string;
}

export interface SendOrderInput extends ReturnOrderInput {
  origin: OrderOrigin;
  total: string;
  tokenHash: string;
  expiresAt: Date;
  details: DraftDetailInput[];
}

export abstract class OrderSubmissionPort {
  abstract send(id: string, input: SendOrderInput): Promise<void>;
  abstract returnToDraft(id: string, input: ReturnOrderInput): Promise<void>;
}
