import type { NotificationEvent, NotificationStatus, PublicTrackingStatus } from '../../../compartido/modelos-base';
import type { Customer, Zone } from '../../clientes/dominio/modelos-clientes';
import type { Order } from '../../pedidos/dominio/modelos-pedidos';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface TrackingHistoryItem {
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  estimatedFrom: string | null;
  estimatedUntil: string | null;
  occurredAt: string;
}

export interface TrackingSnapshot {
  deliveryTurn: number | null;
  changeRequests: Array<{id:string;message:string;status:string;response:string|null;createdAt:string;resolvedAt:string|null}>;
  protectedReference: string;
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  estimatedFrom: string | null;
  estimatedUntil: string | null;
  lastUpdatedAt: string;
  history: TrackingHistoryItem[];
}

export interface TrackingLinkSummary {
  id: string;
  status: 'ACTIVO' | 'EXPIRADO' | 'REVOCADO';
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  createdBy?: Pick<User, 'id' | 'name'>;
}

export interface OrderTrackingResponse {
  link: TrackingLinkSummary | null;
  links?: TrackingLinkSummary[];
  tracking: TrackingSnapshot;
}

export interface EstimationSetting {
  id: string;
  zoneId: string | null;
  zone: Zone | null;
  averageStopMinutes: number;
  toleranceMinutes: number;
  nextDeliveryThreshold: number;
  validFrom: string;
  validUntil: string | null;
  createdBy: Pick<User, 'id' | 'name'>;
}

export interface NotificationTemplate {
  id: string;
  event: NotificationEvent;
  reference: string;
  version: number;
  body: string;
  allowedVariables: string[];
  active: boolean;
  createdAt: string;
  createdBy: Pick<User, 'id' | 'name'>;
}

export interface ChannelSetting {
  id: string;
  provider: 'LIMITEAPI';
  apiUrl: string;
  tokenMasked: string | null;
  tokenConfigured: boolean;
  enabledNumber: string;
  licenseReference: string | null;
  timeoutMs: number;
  maxRetries: number;
  retryDelaySeconds: number;
  active: boolean;
  updatedAt: string;
  updatedBy: Pick<User, 'id' | 'name'>;
}

export interface ChannelTestLog {
  id: string;
  channelId: string | null;
  testedBy: Pick<User, 'id' | 'name'>;
  maskedRecipient: string;
  result: 'EXITOSO' | 'ERROR';
  httpStatus: number | null;
  durationMs: number;
  providerMessageId: string | null;
  sanitizedResponse: Record<string, unknown>;
  error: string | null;
  occurredAt: string;
}

export interface NotificationAttempt {
  id: string;
  attemptNumber: number;
  status: 'ENVIADO' | 'FALLIDO_RECUPERABLE' | 'FALLIDO_DEFINITIVO';
  httpStatus: number | null;
  sanitizedResponse: Record<string, unknown>;
  occurredAt: string;
}

export interface NotificationRecord {
  id: string;
  orderId: string;
  order: Order;
  customerId: string;
  customer: Customer;
  event: NotificationEvent;
  status: NotificationStatus;
  recipient: string;
  renderedBody: string;
  scheduledAt: string;
  processedAt: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  resentFromId: string | null;
  attempts?: NotificationAttempt[];
  createdAt: string;
}
