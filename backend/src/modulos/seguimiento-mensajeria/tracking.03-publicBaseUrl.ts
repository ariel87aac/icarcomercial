import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { DistributionRouteStatus, VisitResultType } from '../distribucion/entidades/distribution.enums';
import { RouteDelivery } from '../distribucion/entidades/route-delivery.entity';
import { VisitResult } from '../distribucion/entidades/visit-result.entity';
import { Order } from '../pedidos/entidades/order.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationStatus } from '../preparacion/entidades/preparation.enums';
import { UserType } from '../seguridad/usuarios/entidades/user-type.enum';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { NotificationService } from './notification.service';
import { NotificationEvent, PublicTrackingStatus, TrackingLinkStatus } from './entidades/tracking.enums';
import { TrackingLink } from './entidades/tracking-link.entity';
import { TrackingUpdate } from './entidades/tracking-update.entity';

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
import { TrackingServiceBase } from './tracking.base';

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
