import type { ProductionConsolidationView } from './production-consolidation.view';
import type { UserView } from './user.view';
import { ProductionConsolidationStatus, ProductionHistoryEvent } from '../../dominio/production.enums';

export interface ProductionConsolidationHistoryView {
  id: string;
  consolidationId: string;
  consolidation: ProductionConsolidationView;
  previousStatus: ProductionConsolidationStatus | null;
  newStatus: ProductionConsolidationStatus;
  event: ProductionHistoryEvent;
  userId: string;
  user: UserView;
  observation: string | null;
  occurredAt: Date;
}
