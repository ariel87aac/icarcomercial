import type { ProductionConsolidationDetailView } from './production-consolidation-detail.view';
import type { UserView } from './user.view';
import { ProductionDeliveryStatus } from '../../dominio/production.enums';

export interface ProductionDeliveryView {
  id: string;
  consolidatedDetailId: string;
  consolidatedDetail: ProductionConsolidationDetailView;
  deliveredQuantity: string;
  finalDelivery: boolean;
  productionIncident: string | null;
  status: ProductionDeliveryStatus;
  deliveredById: string;
  deliveredBy: UserView;
  deliveredAt: Date;
  receivedQuantity: string | null;
  receivedById: string | null;
  receivedBy: UserView | null;
  receivedAt: Date | null;
  warehouseObservation: string | null;
}
