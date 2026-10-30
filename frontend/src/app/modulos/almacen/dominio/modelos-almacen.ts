import type { InventoryMovementType, StockReplenishmentRequestStatus } from '../../../compartido/modelos-base';
import type { OrderDetail } from '../../pedidos/dominio/modelos-pedidos';
import type { ProductionArea, ProductionConsolidation } from '../../produccion/dominio/modelos-produccion';
import type { Product, ProductCategory, ProductPresentation } from '../../productos/dominio/modelos-productos';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface Stock {
  id: string;
  presentationId: string;
  presentation: ProductPresentation;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  shortageQuantity: string;
  version: number;
}

export interface InventoryMovement {
  id: string;
  stockId: string;
  stock: Stock;
  type: InventoryMovementType;
  quantity: string;
  previousBalance: string;
  newBalance: string;
  reason: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  occurredAt: string;
}

export interface InventoryReservation {
  id: string;
  orderDetailId: string;
  stockId: string;
  stock: Stock;
  orderDetail: OrderDetail;
  quantity: string;
  status: 'ACTIVA' | 'CONSUMIDA' | 'LIBERADA';
  user: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface StockReplenishmentRequestDetail {
  id: string;
  requestId: string;
  presentationId: string;
  presentation: ProductPresentation;
  categoryId: string;
  category: ProductCategory;
  productionAreaId: string | null;
  productionArea: ProductionArea | null;
  physicalQuantitySnapshot: string;
  reservedQuantitySnapshot: string;
  demandQuantitySnapshot: string;
  shortageQuantitySnapshot: string;
  additionalStockQuantity: string;
  observation: string | null;
}

export interface StockReplenishmentRequest {
  id: string;
  code: number;
  requiredDate: string;
  status: StockReplenishmentRequestStatus;
  requestedBy: Pick<User, 'id' | 'name' | 'email'>;
  sentBy: Pick<User, 'id' | 'name' | 'email'> | null;
  sentAt: string | null;
  productionConsolidationId: string | null;
  productionConsolidation: Pick<ProductionConsolidation, 'id' | 'version' | 'status' | 'deliveryDate'> | null;
  scheduledAt: string | null;
  closedAt: string | null;
  closeObservation: string | null;
  closedById: string | null;
  closedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  details: StockReplenishmentRequestDetail[];
  detailCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockReplenishmentPlanItem {
  presentation: ProductPresentation & { product: Product };
  category: ProductCategory;
  productionArea: ProductionArea | null;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
  additionalStockQuantity: string;
  totalProductionQuantity: string;
  observation: string | null;
}

export interface StockReplenishmentPlan {
  request: StockReplenishmentRequest;
  items: StockReplenishmentPlanItem[];
}
