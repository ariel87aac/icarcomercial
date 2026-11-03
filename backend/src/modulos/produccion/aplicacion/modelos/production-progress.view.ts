import type { ProductionConsolidationDetailView } from './production-consolidation-detail.view';
import type { UserView } from './user.view';
import { ProductionProgressType } from '../../dominio/production.enums';

export interface ProductionProgressView {
  id: string;
  consolidatedDetailId: string;
  consolidatedDetail: ProductionConsolidationDetailView;
  quantity: string;
  type: ProductionProgressType;
  userId: string;
  user: UserView;
  observation: string | null;
  occurredAt: Date;
}
