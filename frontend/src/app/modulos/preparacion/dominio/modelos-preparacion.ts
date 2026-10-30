import type { PreparationStatus } from '../../../compartido/modelos-base';
import type { InventoryReservation, Stock } from '../../almacen/dominio/modelos-almacen';
import type { Order, OrderDetail } from '../../pedidos/dominio/modelos-pedidos';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface PreparationHistory {
  id: string;
  preparationId: string;
  previousStatus: PreparationStatus | null;
  newStatus: PreparationStatus;
  event: 'INICIO' | 'AVANCE' | 'OBSERVACION' | 'CONFIRMACION' | 'ASIGNACION' | 'DESASIGNACION' | 'DESPACHO' | 'CANCELACION' | 'REAPERTURA' | 'ENTREGA_DISTRIBUCION';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface OrderPreparationDetail {
  id: string;
  preparationId: string;
  orderDetailId: string;
  orderDetail: OrderDetail;
  reservationId: string | null;
  reservation: InventoryReservation | null;
  stockId: string;
  stock: Stock;
  requestedQuantity: string;
  reservedQuantity: string;
  availableSnapshot: string;
  physicalSnapshot: string;
  shortageSnapshot: string;
  preparedQuantity: string;
  difference: string;
  observation: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  physicalQuantityCurrent: string;
  totalReservedQuantityCurrent: string;
  availableQuantityCurrent: string;
  shortageQuantityCurrent: string;
  pickableQuantityCurrent: string;
  productionReceivedQuantity: string;
  productionPendingQuantity: string;
  relatedProductionOrders: Array<{ id: string; code: number; status: string; scheduledDate: string; receivedQuantity: string; plannedQuantity: string }>;
}

export interface OrderPreparation {
  id: string;
  orderId: string;
  order: Order;
  responsibleId: string;
  responsible: Pick<User, 'id' | 'name' | 'email'>;
  status: PreparationStatus;
  version: number;
  productionReferences: string[];
  startedAt: string;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  confirmedAt: string | null;
  canceledBy: Pick<User, 'id' | 'name'> | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  handedOffBy: Pick<User, 'id' | 'name'> | null;
  handedOffAt: string | null;
  details: OrderPreparationDetail[];
  history: PreparationHistory[];
  detailCount?: number;
  shortageItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingDistributionPreparation extends OrderPreparation {
  loadWeightKg: string;
  missingWeightPresentations: string[];
  detailCount: number;
}

export interface EligibleOrder extends Order {
  details: Array<OrderDetail & { reservation: InventoryReservation | null; physicalQuantity: string; totalReservedQuantity: string; availableQuantity: string; shortageQuantity: string; pickableQuantity: string }>;
}

export interface PreparationWorkOrder extends EligibleOrder {
  preparation: OrderPreparation | null;
}
