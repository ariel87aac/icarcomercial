import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { DistributionRouteStatus, VisitResultType } from '../distribution/entities/distribution.enums';
import { RouteDelivery } from '../distribution/entities/route-delivery.entity';
import { VisitResult } from '../distribution/entities/visit-result.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../orders/entities/order.enums';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { PreparationStatus } from '../preparation/entities/preparation.enums';
import { UserType } from '../users/entities/user-type.enum';
import { NotificationService } from './notification.service';
import { NotificationEvent, PublicTrackingStatus, TrackingLinkStatus } from './entities/tracking.enums';
import { TrackingLink } from './entities/tracking-link.entity';
import { TrackingUpdate } from './entities/tracking-update.entity';

export interface TrackingSnapshot {
  protectedReference: string;
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  estimatedFrom: Date | null;
  estimatedUntil: Date | null;
  lastUpdatedAt: Date;
  history: Array<{
    status: PublicTrackingStatus;
    pendingPriorStops: number;
    estimatedFrom: Date | null;
    estimatedUntil: Date | null;
    occurredAt: Date;
  }>;
}

@Injectable()
export class TrackingService {
  private readonly publicRequests = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @InjectRepository(TrackingLink) private readonly links: Repository<TrackingLink>,
    @InjectRepository(TrackingUpdate) private readonly updates: Repository<TrackingUpdate>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderPreparation) private readonly preparations: Repository<OrderPreparation>,
    @InjectRepository(RouteDelivery) private readonly deliveries: Repository<RouteDelivery>,
    @InjectRepository(VisitResult) private readonly visits: Repository<VisitResult>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async generate(orderId: string, expiresAtValue: string, actor: AuthenticatedUser) {
    const expiresAt = new Date(expiresAtValue);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('La fecha de expiración debe ser futura');
    const order = await this.loadOrder(orderId);
    if (order.status !== OrderStatus.CONFIRMED) throw new ConflictException('El seguimiento solo puede habilitarse para un pedido confirmado');
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TrackingLink);
      const active = await repository.findOne({ where: { orderId, status: TrackingLinkStatus.ACTIVE } });
      if (active) {
        active.status = TrackingLinkStatus.REVOKED;
        active.revokedById = actor.id;
        active.revokedAt = new Date();
        await repository.save(active);
      }
      const created = await repository.save(repository.create({ orderId, tokenHash, status: TrackingLinkStatus.ACTIVE, expiresAt, createdById: actor.id, revokedById: null, revokedAt: null }));
      return created.id;
    });
    await this.audit.record({ userId: actor.id, module: 'tracking', action: 'GENERAR_ENLACE', entity: 'enlaces_seguimiento', entityId: id, result: 'EXITOSO', metadata: { orderId, expiresAt } });
    const publicUrl = `${this.publicBaseUrl()}/seguimiento/${rawToken}`;
    await this.safeCaptureOrder(orderId, `link.generated:${id}`);
    return {
      id,
      orderId,
      status: TrackingLinkStatus.ACTIVE,
      expiresAt,
      url: publicUrl,
      shownOnce: true,
    };
  }

  async revoke(orderId: string, actor: AuthenticatedUser): Promise<{ revoked: true }> {
    const link = await this.links.findOne({ where: { orderId, status: TrackingLinkStatus.ACTIVE } });
    if (!link) throw new NotFoundException('No existe un enlace activo para el pedido');
    link.status = TrackingLinkStatus.REVOKED;
    link.revokedById = actor.id;
    link.revokedAt = new Date();
    await this.links.save(link);
    await this.audit.record({ userId: actor.id, module: 'tracking', action: 'REVOCAR_ENLACE', entity: 'enlaces_seguimiento', entityId: link.id, result: 'EXITOSO', metadata: { orderId } });
    return { revoked: true };
  }

  async internal(orderId: string, actor: AuthenticatedUser) {
    const order = await this.loadOrder(orderId);
    if (actor.type === UserType.CUSTOMER && order.customerId !== actor.customerId) throw new NotFoundException('Pedido no encontrado');
    if (actor.type === UserType.CUSTOMER && !actor.permissions.includes('tracking.own.read')) throw new NotFoundException('Pedido no encontrado');
    if (actor.type !== UserType.CUSTOMER && !actor.permissions.includes('tracking.links.read')) throw new NotFoundException('Pedido no encontrado');
    const links = await this.links.find({ where: { orderId }, relations: { createdBy: true }, order: { createdAt: 'DESC' } });
    const active = links.find((link) => link.status === TrackingLinkStatus.ACTIVE && link.expiresAt > new Date()) ?? null;
    const snapshot = active ? await this.snapshot(active, order) : await this.currentWithoutLink(order);
    return {
      link: active ? { id: active.id, status: active.status, expiresAt: active.expiresAt, createdAt: active.createdAt, createdBy: active.createdBy } : null,
      links: actor.type === UserType.CUSTOMER ? undefined : links.map((link) => ({ id: link.id, status: this.effectiveStatus(link), expiresAt: link.expiresAt, createdAt: link.createdAt, revokedAt: link.revokedAt, createdBy: link.createdBy })),
      tracking: snapshot,
    };
  }

  async publicTracking(token: string, clientKey: string): Promise<TrackingSnapshot> {
    this.rateLimit(clientKey);
    const link = await this.links.findOne({ where: { tokenHash: this.hash(token), status: TrackingLinkStatus.ACTIVE }, relations: { order: { customer: true, address: { zone: true } } } });
    if (!link || link.expiresAt <= new Date()) {
      if (link && link.expiresAt <= new Date()) {
        link.status = TrackingLinkStatus.EXPIRED;
        await this.links.save(link);
      }
      throw new NotFoundException('El enlace de seguimiento no está disponible');
    }
    return this.snapshot(link, link.order);
  }

  async safeCaptureOrder(orderId: string, sourceEvent: string): Promise<void> {
    try {
      await this.captureOrder(orderId, sourceEvent);
    } catch (error) {
      await this.audit.record({ module: 'tracking', action: 'PROYECTAR_EVENTO', entity: 'pedidos', entityId: orderId, result: 'ERROR', metadata: { sourceEvent, message: error instanceof Error ? error.message : 'Error no identificado' } }).catch(() => undefined);
    }
  }

  async safeCaptureRoute(routeId: string, sourceEvent: string): Promise<void> {
    try {
      const rows = await this.deliveries.find({ where: { routeId }, select: { id: true, orderId: true } });
      await Promise.all(rows.map((row) => this.safeCaptureOrder(row.orderId, `${sourceEvent}:${row.orderId}`)));
    } catch (error) {
      await this.audit.record({ module: 'tracking', action: 'PROYECTAR_RUTA', entity: 'rutas_distribucion', entityId: routeId, result: 'ERROR', metadata: { sourceEvent, message: error instanceof Error ? error.message : 'Error no identificado' } }).catch(() => undefined);
    }
  }

  async captureOrder(orderId: string, sourceEvent: string): Promise<TrackingUpdate | null> {
    const link = await this.links.findOne({ where: { orderId, status: TrackingLinkStatus.ACTIVE } });
    if (!link || link.expiresAt <= new Date()) return null;
    const duplicate = await this.updates.findOne({ where: { sourceEvent } });
    if (duplicate) return duplicate;
    const order = await this.loadOrder(orderId);
    const projection = await this.project(order);
    let update: TrackingUpdate;
    try {
      update = await this.updates.save(this.updates.create({ linkId: link.id, orderId, visibleStatus: projection.status, sourceEvent, pendingPriorStops: projection.pendingPriorStops, estimatedFrom: projection.estimatedFrom, estimatedUntil: projection.estimatedUntil }));
    } catch (error) {
      const existing = await this.updates.findOne({ where: { sourceEvent } });
      if (existing) return existing;
      throw error;
    }
    const event = await this.notificationEvent(sourceEvent, projection.status, projection.pendingPriorStops, order.address.zoneId);
    await this.notifications.enqueue(order, link, event, this.eventVersion(sourceEvent), {
      orderReference: order.code,
      publicStatus: projection.status,
      pendingStops: String(projection.pendingPriorStops),
      estimatedFrom: projection.estimatedFrom?.toISOString() ?? '',
      estimatedUntil: projection.estimatedUntil?.toISOString() ?? '',
      customerName: order.customer.businessName,
    });
    return update;
  }

  private async snapshot(link: TrackingLink, order: Order): Promise<TrackingSnapshot> {
    let history = await this.updates.find({ where: { linkId: link.id }, order: { occurredAt: 'ASC' } });
    if (!history.length) {
      await this.safeCaptureOrder(order.id, `tracking.read:${link.id}`);
      history = await this.updates.find({ where: { linkId: link.id }, order: { occurredAt: 'ASC' } });
    }
    const current = history.at(-1) ?? await this.project(order);
    return {
      protectedReference: order.code,
      status: current instanceof TrackingUpdate ? current.visibleStatus : current.status,
      pendingPriorStops: current.pendingPriorStops,
      estimatedFrom: current.estimatedFrom,
      estimatedUntil: current.estimatedUntil,
      lastUpdatedAt: current instanceof TrackingUpdate ? current.occurredAt : new Date(),
      history: history.map((item) => ({ status: item.visibleStatus, pendingPriorStops: item.pendingPriorStops, estimatedFrom: item.estimatedFrom, estimatedUntil: item.estimatedUntil, occurredAt: item.occurredAt })),
    };
  }

  private async currentWithoutLink(order: Order): Promise<TrackingSnapshot> {
    const current = await this.project(order);
    return { protectedReference: order.code, status: current.status, pendingPriorStops: current.pendingPriorStops, estimatedFrom: current.estimatedFrom, estimatedUntil: current.estimatedUntil, lastUpdatedAt: new Date(), history: [] };
  }

  private async project(order: Order) {
    const delivery = await this.deliveries.findOne({ where: { orderId: order.id }, relations: { route: true, result: true }, order: { createdAt: 'DESC' } });
    const preparation = await this.preparations.findOne({ where: { orderId: order.id }, order: { createdAt: 'DESC' } });
    let status = PublicTrackingStatus.ORDER_CONFIRMED;
    if (preparation && [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED].includes(preparation.status)) status = PublicTrackingStatus.IN_PREPARATION;
    if (preparation && [PreparationStatus.PREPARED, PreparationStatus.ASSIGNED, PreparationStatus.DISPATCHED].includes(preparation.status)) status = PublicTrackingStatus.PREPARED;
    if (delivery?.route.status === DistributionRouteStatus.IN_DELIVERY && !delivery.result) status = PublicTrackingStatus.IN_ROUTE;
    if (delivery?.result) status = delivery.result.result === VisitResultType.DELIVERED ? PublicTrackingStatus.DELIVERED : PublicTrackingStatus.DELIVERY_NOT_COMPLETED;
    const estimate = await this.estimate(delivery, order.address.zoneId);
    return { status, ...estimate };
  }

  private async estimate(delivery: RouteDelivery | null, zoneId: string | null): Promise<{ pendingPriorStops: number; estimatedFrom: Date | null; estimatedUntil: Date | null }> {
    if (!delivery || !delivery.route.departedAt || !delivery.position || delivery.result) return { pendingPriorStops: 0, estimatedFrom: null, estimatedUntil: null };
    const setting = await this.notifications.activeSetting(zoneId);
    const pendingPriorStops = await this.deliveries.createQueryBuilder('delivery')
      .leftJoin('delivery.result', 'result')
      .where('delivery.routeId = :routeId', { routeId: delivery.routeId })
      .andWhere('delivery.position < :position', { position: delivery.position })
      .andWhere('result.id IS NULL')
      .getCount();
    if (!setting) return { pendingPriorStops, estimatedFrom: null, estimatedUntil: null };
    const latestPrior = await this.visits.createQueryBuilder('result')
      .innerJoin('result.delivery', 'visitedDelivery')
      .where('visitedDelivery.routeId = :routeId', { routeId: delivery.routeId })
      .andWhere('visitedDelivery.position < :position', { position: delivery.position })
      .orderBy('result.occurredAt', 'DESC')
      .getOne();
    const center = latestPrior
      ? latestPrior.occurredAt.getTime() + pendingPriorStops * setting.averageStopMinutes * 60_000
      : delivery.route.departedAt.getTime() + (delivery.position - 1) * setting.averageStopMinutes * 60_000;
    const tolerance = setting.toleranceMinutes * 60_000;
    return { pendingPriorStops, estimatedFrom: new Date(center - tolerance), estimatedUntil: new Date(center + tolerance) };
  }

  private async notificationEvent(sourceEvent: string, status: PublicTrackingStatus, pendingStops: number, zoneId: string | null): Promise<NotificationEvent> {
    if (sourceEvent.startsWith('order.confirmed')) return NotificationEvent.ORDER_CONFIRMED;
    if (sourceEvent.startsWith('route.departure')) return NotificationEvent.ROUTE_DEPARTURE;
    if (status === PublicTrackingStatus.DELIVERED) return NotificationEvent.DELIVERED;
    if (status === PublicTrackingStatus.DELIVERY_NOT_COMPLETED) return NotificationEvent.DELIVERY_NOT_COMPLETED;
    const setting = await this.notifications.activeSetting(zoneId);
    if (status === PublicTrackingStatus.IN_ROUTE && setting && pendingStops <= setting.nextDeliveryThreshold) return NotificationEvent.NEXT_DELIVERY;
    return NotificationEvent.RELEVANT_CHANGE;
  }

  private eventVersion(sourceEvent: string): number {
    const hash = createHash('sha256').update(sourceEvent).digest();
    return Math.max(1, hash.readUInt32BE(0) % 2_147_483_647);
  }

  private async loadOrder(id: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { id }, relations: { customer: true, address: { zone: true } } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private effectiveStatus(link: TrackingLink): TrackingLinkStatus {
    return link.status === TrackingLinkStatus.ACTIVE && link.expiresAt <= new Date() ? TrackingLinkStatus.EXPIRED : link.status;
  }

  private publicBaseUrl(): string {
    const configured = this.config.get<string>('PUBLIC_APP_URL', '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return this.config.get<string>('CORS_ORIGIN', 'http://localhost:8080').split(',')[0].trim().replace(/\/$/, '');
  }

  private rateLimit(key: string): void {
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
