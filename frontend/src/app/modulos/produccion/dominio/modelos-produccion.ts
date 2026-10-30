import type { ProductionConsolidationStatus, ProductionConsolidationType, ProductionDetailStage, RecordStatus } from '../../../compartido/modelos-base';
import type { StockReplenishmentRequest, StockReplenishmentRequestDetail } from '../../almacen/dominio/modelos-almacen';
import type { Order, OrderDetail } from '../../pedidos/dominio/modelos-pedidos';
import type { Product, ProductCategory, ProductLine, ProductPresentation, UnitMeasure } from '../../productos/dominio/modelos-productos';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface ProductionConsolidationSource {
  id: string;
  consolidatedDetailId: string;
  orderDetailId: string;
  presentationId: string;
  presentation: ProductPresentation;
  originalQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  appliedFactor: string;
  baseContribution: string;
  warehouseContribution: string;
  productionContribution: string;
  orderDetail: OrderDetail & { order: Order };
  createdAt: string;
}

export interface ProductionProgress {
  id: string;
  consolidatedDetailId: string;
  quantity: string;
  type: 'AVANCE';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
}

export interface ProductionConsolidationDetail {
  id: string;
  consolidationId: string;
  productId: string;
  product: Product;
  categoryId: string | null;
  category: ProductCategory | null;
  presentationId: string | null;
  presentation: ProductPresentation | null;
  productionAreaId: string | null;
  productionArea: ProductionArea | null;
  productLineId: string;
  productLine: ProductLine;
  baseUnitId: string;
  baseUnit: UnitMeasure;
  requestedQuantity: string;
  warehouseCoveredQuantity: string;
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  stockRequestDetailId: string | null;
  stockRequestDetail: (StockReplenishmentRequestDetail & {
    request: Pick<StockReplenishmentRequest, 'id' | 'code' | 'requiredDate' | 'status'>;
  }) | null;
  additionalProductionQuantity: string;
  plannedQuantity: string;
  additionalProductionReason: string | null;
  preparedQuantity: string;
  receivedQuantity: string;
  stage: ProductionDetailStage;
  scheduledDate: string;
  sequence: number;
  startedAt: string | null;
  completedAt: string | null;
  canceledById: string | null;
  canceledBy: Pick<User, 'id' | 'name' | 'email'> | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  difference: string;
  sources: ProductionConsolidationSource[];
  progress: ProductionProgress[];
  deliveries: ProductionDelivery[];
}

export interface ProductionArea {
  id: string;
  name: string;
  status: RecordStatus;
  categories: ProductCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductionDelivery {
  id: string;
  consolidatedDetailId: string;
  consolidatedDetail: ProductionConsolidationDetail;
  deliveredQuantity: string;
  finalDelivery: boolean;
  productionIncident: string | null;
  status: 'PENDIENTE' | 'ACEPTADA';
  deliveredBy: Pick<User, 'id' | 'name'>;
  deliveredAt: string;
  receivedQuantity: string | null;
  receivedBy: Pick<User, 'id' | 'name'> | null;
  receivedAt: string | null;
  warehouseObservation: string | null;
}

export interface ProductionConsolidation {
  id: string;
  code: number;
  deliveryDate: string;
  preparationDeadlineAt: string | null;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  generatedBy: Pick<User, 'id' | 'name' | 'email'>;
  emittedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  emittedAt: string | null;
  closedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  closedAt: string | null;
  incompleteCloseObservation: string | null;
  cancellationReason: string | null;
  canceledBy: Pick<User, 'id' | 'name' | 'email'> | null;
  canceledAt: string | null;
  details: ProductionConsolidationDetail[];
  detailCount?: number;
  createdAt: string;
}

export interface ProductionTrackingSummary {
  productCount: number;
  completedCount: number;
  incidentCount: number;
  canceledCount: number;
  pendingReceiptCount: number;
  producedPercent: number | null;
  receivedPercent: number | null;
}

export interface ProductionTrackingOrder extends ProductionConsolidation {
  tracking: ProductionTrackingSummary;
}

export interface ProductionHistory {
  id: string;
  consolidationId: string;
  previousStatus: ProductionConsolidationStatus | null;
  newStatus: ProductionConsolidationStatus;
  event: 'GENERACION' | 'RECALCULO' | 'AJUSTE_LOTE' | 'PRODUCCION_ADICIONAL' | 'PRODUCTO_AGREGADO' | 'PRODUCTO_RETIRADO' | 'EMISION' | 'PROGRAMACION' | 'INICIO' | 'AVANCE' | 'ENTREGA_PRODUCCION' | 'RECEPCION_ALMACEN' | 'CANCELACION_PRODUCTO' | 'CANCELACION_ORDEN' | 'CIERRE_INCOMPLETO' | 'CIERRE';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
}

export interface ProductionSummaryRow {
  deliveryDate: string;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  productLineId: string;
  productLineName: string;
  productId: string;
  productName: string;
  categoryName: string | null;
  productionAreaName: string | null;
  presentationId: string | null;
  presentationDescription: string | null;
  baseUnitId: string;
  baseUnitAbbreviation: string;
  requestedQuantity: string;
  warehouseCoveredQuantity: string;
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  additionalProductionQuantity: string;
  plannedQuantity: string;
  preparedQuantity: string;
  receivedQuantity: string;
  pendingQuantity: string;
  difference: string;
}
