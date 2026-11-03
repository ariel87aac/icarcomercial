import type { Order } from '../../entidades/order.entity';
import type { OrderHistory } from '../../entidades/order-history.entity';
import { OrderStatus } from '../../entidades/order.enums';

export interface OrderReadCriteria {
  page: number;
  limit: number;
  q?: string;
  status?: OrderStatus;
  view?: 'ACTIVE' | 'ALL';
  from?: string;
  to?: string;
  /** undefined: consulta interna sin filtro; null: cliente sin cuenta asociada. */
  customerId?: string | null;
}

/** Contrato de lectura; conserva temporalmente los modelos de respuesta existentes. */
export abstract class OrderReadPort {
  abstract findAll(criteria: OrderReadCriteria): Promise<{ data: Order[]; total: number }>;
  abstract statusSummary(customerId?: string | null): Promise<Record<OrderStatus, number>>;
  abstract loadOrder(id: string): Promise<Order | null>;
  abstract findDraftId(customerId: string): Promise<string | null>;
  abstract latestDraft(customerId: string): Promise<Order | null>;
  abstract enrichWorkflow(order: Order): Promise<void>;
  abstract history(orderId: string): Promise<OrderHistory[]>;
}
