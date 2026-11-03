import type { ProductionConsolidationView } from './production-consolidation.view';
import type { StockReplenishmentRequestDetailView } from './stock-replenishment-request-detail.view';
import type { UserView } from './user.view';

export interface StockReplenishmentRequestView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  requiredDate: string;
  status: string;
  requestedById: string;
  requestedBy: UserView;
  sentById: string | null;
  sentBy: UserView | null;
  sentAt: Date | null;
  returnedById: string | null;
  returnedBy: UserView | null;
  returnedAt: Date | null;
  returnReason: string | null;
  productionConsolidationId: string | null;
  productionConsolidation: ProductionConsolidationView | null;
  scheduledAt: Date | null;
  closedAt: Date | null;
  closeObservation: string | null;
  closedById: string | null;
  closedBy: UserView | null;
  details: StockReplenishmentRequestDetailView[];
}
