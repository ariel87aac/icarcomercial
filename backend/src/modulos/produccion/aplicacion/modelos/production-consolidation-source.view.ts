import type { ProductionConsolidationDetailView } from './production-consolidation-detail.view';
import type { ProductPresentationView } from './product-presentation.view';
import type { OrderDetailView } from './order-detail.view';

export interface ProductionConsolidationSourceView {
  id: string;
  consolidatedDetailId: string;
  consolidatedDetail: ProductionConsolidationDetailView;
  orderDetailId: string;
  orderDetail: OrderDetailView;
  presentationId: string;
  presentation: ProductPresentationView;
  originalQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  appliedFactor: string;
  baseContribution: string;
  warehouseContribution: string;
  productionContribution: string;
  createdAt: Date;
}
