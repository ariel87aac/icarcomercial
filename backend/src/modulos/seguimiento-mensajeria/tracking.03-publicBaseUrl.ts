import { HttpException, HttpStatus } from '@nestjs/common';
import { PublicTrackingStatus } from './entidades/tracking.enums';
import { TrackingServiceBase } from './tracking.base';

export interface TrackingSnapshot {
  protectedReference: string;
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  deliveryTurn: number | null;
  estimatedFrom: Date | null;
  estimatedUntil: Date | null;
  lastUpdatedAt: Date;
  changeRequests: Array<{id:string;message:string;status:string;response:string|null;createdAt:Date;resolvedAt:Date|null}>;
  history: Array<{
    status: PublicTrackingStatus;
    pendingPriorStops: number;
    estimatedFrom: Date | null;
    estimatedUntil: Date | null;
    occurredAt: Date;
  }>;
}

export abstract class TrackingServiceParte03 extends TrackingServiceBase {
  protected publicBaseUrl(): string {
      const configured = this.config.get<string>('PUBLIC_APP_URL', '').trim();
      if (configured) return configured.replace(/\/$/, '');
      return this.config.get<string>('CORS_ORIGIN', 'http://localhost:8080').split(',')[0].trim().replace(/\/$/, '');
    }

  protected rateLimit(key: string): void {
      const now = Date.now();
      const windowMs = this.config.get<number>('PUBLIC_TRACKING_RATE_WINDOW_MS', 60000);
      const limit = this.config.get<number>('PUBLIC_TRACKING_RATE_LIMIT', 30);
      const entry = this.publicRequests.get(key);
      if (!entry || entry.resetAt <= now) {
        this.publicRequests.set(key, { count: 1, resetAt: now + windowMs });
        if (this.publicRequests.size > 5000) for (const [storedKey, value] of this.publicRequests) if (value.resetAt <= now) this.publicRequests.delete(storedKey);
        return;
      }
      entry.count += 1;
      if (entry.count > limit) throw new HttpException('Demasiadas solicitudes de seguimiento', HttpStatus.TOO_MANY_REQUESTS);
    }
}
