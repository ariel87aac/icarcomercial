export interface OrderAuditEntry {
  userId: string;
  module: 'orders';
  action: string;
  entity: 'pedidos';
  entityId: string;
  result: 'EXITOSO' | 'RECHAZADO' | 'ERROR';
  metadata?: Record<string, unknown>;
}

export abstract class OrderAuditPort {
  abstract record(entry: OrderAuditEntry): Promise<void>;
}
