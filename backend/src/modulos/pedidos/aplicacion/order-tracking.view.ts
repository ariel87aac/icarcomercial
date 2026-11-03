import { PublicTrackingStatus } from '../../seguimiento-mensajeria/entidades/tracking.enums';

export interface OrderTrackingView {
  protectedReference: string;
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  deliveryTurn: number | null;
  estimatedFrom: Date | null;
  estimatedUntil: Date | null;
  lastUpdatedAt: Date;
  changeRequests: Array<{
    id: string;
    message: string;
    status: string;
    response: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  }>;
  history: Array<{
    status: PublicTrackingStatus;
    pendingPriorStops: number;
    estimatedFrom: Date | null;
    estimatedUntil: Date | null;
    occurredAt: Date;
  }>;
}
