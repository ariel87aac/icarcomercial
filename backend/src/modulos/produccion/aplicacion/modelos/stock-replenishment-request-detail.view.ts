import type { ProductionAreaView } from './production-area.view';
import type { StockReplenishmentRequestView } from './stock-replenishment-request.view';
import type { ProductCategoryView } from './product-category.view';
import type { ProductPresentationView } from './product-presentation.view';

export interface StockReplenishmentRequestDetailView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  requestId: string;
  request: StockReplenishmentRequestView;
  presentationId: string;
  presentation: ProductPresentationView;
  categoryId: string;
  category: ProductCategoryView;
  productionAreaId: string | null;
  productionArea: ProductionAreaView | null;
  physicalQuantitySnapshot: string;
  reservedQuantitySnapshot: string;
  demandQuantitySnapshot: string;
  shortageQuantitySnapshot: string;
  additionalStockQuantity: string;
  observation: string | null;
}
