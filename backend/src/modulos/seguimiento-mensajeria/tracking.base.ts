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
export abstract class TrackingServiceBase {
  [nombre: string]: any;

  protected readonly publicRequests = new Map<string, { count: number; resetAt: number }>();

  constructor(
        @InjectRepository(TrackingLink) protected readonly links: Repository<TrackingLink>,
        @InjectRepository(TrackingUpdate) protected readonly updates: Repository<TrackingUpdate>,
        @InjectRepository(Order) protected readonly orders: Repository<Order>,
        @InjectRepository(OrderPreparation) protected readonly preparations: Repository<OrderPreparation>,
        @InjectRepository(RouteDelivery) protected readonly deliveries: Repository<RouteDelivery>,
        @InjectRepository(VisitResult) protected readonly visits: Repository<VisitResult>,
        protected readonly dataSource: DataSource,
        protected readonly notifications: NotificationService,
        protected readonly audit: AuditService,
        protected readonly config: ConfigService,
        protected readonly tokenCipher: ChannelTokenCipherService,
      ) {}
}
