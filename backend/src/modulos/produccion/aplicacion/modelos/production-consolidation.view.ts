import type { ProductionConsolidationDetailView } from './production-consolidation-detail.view';
import type { ProductionConsolidationHistoryView } from './production-consolidation-history.view';
import type { UserView } from './user.view';
import { ProductionConsolidationStatus, ProductionConsolidationType } from '../../dominio/production.enums';

export interface ProductionConsolidationView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  code: number;
  deliveryDate: string;
  preparationDeadlineAt: Date | null;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  generatedById: string;
  generatedBy: UserView;
  emittedById: string | null;
  emittedBy: UserView | null;
  emittedAt: Date | null;
  closedById: string | null;
  closedBy: UserView | null;
  closedAt: Date | null;
  incompleteCloseObservation: string | null;
  cancellationReason: string | null;
  canceledById: string | null;
  canceledBy: UserView | null;
  canceledAt: Date | null;
  details: ProductionConsolidationDetailView[];
  history: ProductionConsolidationHistoryView[];
}
