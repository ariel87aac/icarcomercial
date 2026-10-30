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
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { NotificationService } from './notification.service';
import { NotificationEvent, PublicTrackingStatus, TrackingLinkStatus } from './entities/tracking.enums';
import { TrackingLink } from './entities/tracking-link.entity';
import { TrackingUpdate } from './entities/tracking-update.entity';

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
    private readonly tokenCipher: ChannelTokenCipherService,
  ) {}

  async generate(orderId: string, expiresAtValue: string, actor: AuthenticatedUser) {
    const expiresAt = new Date(expiresAtValue);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('La fecha de expiración debe ser futura');
    const order = await this.loadOrder(orderId);
    if (order.deletedAt) throw new NotFoundException('Pedido no encontrado');
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const id = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`tracking-link:${orderId}`]);
      const repository = manager.getRepository(TrackingLink);
      const active = await repository.findOne({ where: { orderId, status: TrackingLinkStatus.ACTIVE } });
      if (active) {
        active.status = TrackingLinkStatus.REVOKED;
        active.revokedById = actor.id;
        active.revokedAt = new Date();
        await repository.save(active);
      }
      const created = await repository.save(repository.create({ orderId, tokenHash, encryptedToken: this.tokenCipher.encrypt(rawToken), status: TrackingLinkStatus.ACTIVE, expiresAt, createdById: actor.id, revokedById: null, revokedAt: null }));
      return created.id;
    });
    await this.audit.record({ userId: actor.id, module: 'tracking', action: 'GENERAR_ENLACE', entity: 'enlaces_seguimiento', entityId: id, result: 'EXITOSO', metadata: { orderId, expiresAt } });
    const publicUrl = `${this.publicBaseUrl()}/seguimiento/${rawToken}`;
    await this.safeCaptureOrder(orderId, `link.generated:${id}`, false);
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
    const link = await this.links.findOne({ where: [{ tokenHash: this.hash(token), status: TrackingLinkStatus.ACTIVE }, { legacyTokenHash: this.hash(token), status: TrackingLinkStatus.ACTIVE }], relations: { order: { customer: true, address: { zone: true } } } });
    if (!link || !link.order || link.expiresAt <= new Date()) {
      if (link && link.expiresAt <= new Date()) {
        link.status = TrackingLinkStatus.EXPIRED;
        await this.links.save(link);
      }
      throw new NotFoundException('El enlace de seguimiento no está disponible');
    }
    return this.snapshot(link, link.order);
  }

  async ensureOrderLink(order: Order): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`tracking-link:${order.id}`]);
      const repository = manager.getRepository(TrackingLink);
      const existing = await repository.createQueryBuilder('link').addSelect('link.encryptedToken')
        .where('link.orderId = :orderId', { orderId: order.id }).orderBy('link.createdAt', 'DESC').getOne();
      if (existing) {
        // Never silently renew a revoked/expired link.
        if (existing.status !== TrackingLinkStatus.ACTIVE || existing.expiresAt <= new Date()) return '';
        if (!existing.encryptedToken) {
          // Upgrade hash-only legacy links without breaking the URL already held by the customer.
          const token = randomBytes(32).toString('base64url');
          existing.legacyTokenHash = existing.tokenHash;
          existing.tokenHash = this.hash(token);
          existing.encryptedToken = this.tokenCipher.encrypt(token);
          await repository.save(existing);
        }
        return `${this.publicBaseUrl()}/seguimiento/${this.tokenCipher.decrypt(existing.encryptedToken)}`;
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Math.max(Date.now(), new Date(order.requestedDate).getTime()) + 90 * 86400000);
      await repository.save(repository.create({ orderId: order.id, tokenHash: this.hash(token),
        encryptedToken: this.tokenCipher.encrypt(token), status: TrackingLinkStatus.ACTIVE, expiresAt,
        createdById: order.createdById, revokedById: null, revokedAt: null }));
      return `${this.publicBaseUrl()}/seguimiento/${token}`;
    });
  }

  async safeCaptureOrder(orderId: string, sourceEvent: string, notify = true): Promise<void> {
    try {
      await this.captureOrder(orderId, sourceEvent, notify);
    } catch (error) {
      await this.audit.record({ module: 'tracking', action: 'PROYECTAR_EVENTO', entity: 'pedidos', entityId: orderId, result: 'ERROR', metadata: { sourceEvent, message: error instanceof Error ? error.message : 'Error no identificado' } }).catch(() => undefined);
    }
  }

  async safeCaptureRoute(routeId: string, sourceEvent: string): Promise<void> {
    try {
      const rows = await this.deliveries.find({ where: { routeId }, select: { id: true, orderId: true } });
      for (const row of rows) {
        await this.safeCaptureOrder(row.orderId, `${sourceEvent}:${row.orderId}`);
        // Optional legacy alerts remain opt-in; normal turn updates only change the tracking page.
        const event = sourceEvent.startsWith('route.visit:') ? NotificationEvent.NEXT_DELIVERY
          : /^(route.rescheduled|route.sequence):/.test(sourceEvent) ? NotificationEvent.RELEVANT_CHANGE : null;
        if (!event || !await this.notifications.eventEnabled(event)) continue;
        const order = await this.loadOrder(row.orderId);
        const current = await this.project(order);
        if (event === NotificationEvent.NEXT_DELIVERY) {
          const setting = await this.notifications.activeSetting(order.address.zoneId);
          if (current.status !== PublicTrackingStatus.IN_ROUTE || !setting || current.pendingPriorStops > setting.nextDeliveryThreshold) continue;
        }
        await this.notifications.enqueue(order, null, event, this.eventVersion(`${sourceEvent}:${row.orderId}`), {
          orderReference: order.code, publicStatus: current.status, pendingStops: String(current.pendingPriorStops),
          trackingUrl: await this.ensureOrderLink(order), customerName: order.customer.businessName,
          estimatedFrom: current.estimatedFrom?.toISOString() ?? '', estimatedUntil: current.estimatedUntil?.toISOString() ?? '',
        });
      }
    } catch (error) {
      await this.audit.record({ module: 'tracking', action: 'PROYECTAR_RUTA', entity: 'rutas_distribucion', entityId: routeId,
        result: 'ERROR', metadata: { sourceEvent, message: error instanceof Error ? error.message : 'Error no identificado' } }).catch(() => undefined);
    }
  }

  async refreshStock(sourceEvent: string): Promise<void> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      "SELECT id FROM pedidos WHERE estado = 'CONFIRMADO' AND eliminado_at IS NULL ORDER BY created_at, id",
    );
    for (const row of rows) await this.safeCaptureOrder(row.id, `${sourceEvent}:${row.id}`);
  }

  async captureOrder(orderId: string, sourceEvent: string, notify = true): Promise<TrackingUpdate | null> {
    const update = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(741001)');
      // Import genuine commercial transitions, including returns to draft. Link rotation never resets history.
      await manager.query(`INSERT INTO actualizaciones_seguimiento (pedido_id, estado_visible, evento_origen, fecha_hora)
        SELECT pedido_id, CASE estado_nuevo::text WHEN 'CONFIRMADO' THEN 'PEDIDO_CONFIRMADO' ELSE estado_nuevo::text END,
          'order.history:' || id, fecha_hora FROM pedidos_estados_historial WHERE pedido_id = $1
        ON CONFLICT (evento_origen) DO NOTHING`, [orderId]);
      const order = await this.loadOrder(orderId);
      const projection = await this.project(order);
      const repository = manager.getRepository(TrackingUpdate);
      const previous = await repository.findOne({ where: { orderId }, order: { occurredAt: 'DESC', id: 'DESC' } });
      if (previous?.visibleStatus === projection.status && previous.pendingPriorStops === projection.pendingPriorStops) return null;
      const existing = await repository.findOne({ where: { sourceEvent } });
      if (existing) return null;
      const stateChanged = previous?.visibleStatus !== projection.status;
      const event = this.statusEvent(projection.status);
      const enabled = event ? await this.notifications.eventEnabled(event) : false;
      return repository.save(repository.create({ linkId: null, orderId, visibleStatus: projection.status, sourceEvent,
        pendingPriorStops: projection.pendingPriorStops, estimatedFrom: projection.estimatedFrom, estimatedUntil: projection.estimatedUntil,
        notificationHandled: !notify || !stateChanged || !enabled }));
    });
    if (update && !update.notificationHandled) await this.sendUpdate(update);
    return update;
  }

  async flushPendingUpdates(): Promise<void> {
    const pending = await this.updates.find({ where: { notificationHandled: false }, order: { occurredAt: 'ASC' }, take: 100 });
    for (const update of pending) await this.sendUpdate(update);
  }

  private async sendUpdate(update: TrackingUpdate): Promise<void> {
    const event = this.statusEvent(update.visibleStatus);
    if (event && await this.notifications.eventEnabled(event)) {
      const order = await this.loadOrder(update.orderId);
      const trackingUrl = await this.ensureOrderLink(order);
      await this.notifications.enqueue(order, null, event, this.eventVersion(update.id), {
        orderReference: order.code, publicStatus: update.visibleStatus,
        pendingStops: String(update.pendingPriorStops), trackingUrl,
        estimatedFrom: update.estimatedFrom?.toISOString() ?? '', estimatedUntil: update.estimatedUntil?.toISOString() ?? '',
        customerName: order.customer.businessName,
      }, update.id);
    }
    await this.updates.update(update.id, { notificationHandled: true });
  }

  private statusEvent(status: PublicTrackingStatus): NotificationEvent | null {
    const events: Partial<Record<PublicTrackingStatus, NotificationEvent>> = {
      [PublicTrackingStatus.IN_PREPARATION]: NotificationEvent.IN_PREPARATION,
      [PublicTrackingStatus.STOCK_READY]: NotificationEvent.STOCK_READY,
      [PublicTrackingStatus.PREPARED]: NotificationEvent.PREPARED,
      [PublicTrackingStatus.ASSIGNED]: NotificationEvent.ASSIGNED,
      [PublicTrackingStatus.IN_ROUTE]: NotificationEvent.ROUTE_DEPARTURE,
      [PublicTrackingStatus.DELIVERED]: NotificationEvent.DELIVERED,
      [PublicTrackingStatus.PARTIAL]: NotificationEvent.PARTIAL,
      [PublicTrackingStatus.DELIVERY_NOT_COMPLETED]: NotificationEvent.DELIVERY_NOT_COMPLETED,
    };
    return events[status] ?? null;
  }

  async orderSnapshot(orderId: string): Promise<TrackingSnapshot> {
    return this.currentWithoutLink(await this.loadOrder(orderId));
  }

  private async snapshot(_link: TrackingLink, order: Order): Promise<TrackingSnapshot> {
    return this.currentWithoutLink(order);
  }

  private async currentWithoutLink(order: Order): Promise<TrackingSnapshot> {
    await this.safeCaptureOrder(order.id, `tracking.read:${randomBytes(12).toString('hex')}`, false);
    const [current, history] = await Promise.all([
      this.project(order), this.updates.find({ where: { orderId: order.id }, order: { occurredAt: 'ASC', id: 'ASC' } }),
    ]);
    const changeRequests = await this.dataSource.query(`SELECT id, mensaje AS message, estado AS status,
      respuesta AS response, created_at AS "createdAt", resuelto_at AS "resolvedAt" FROM solicitudes_cambio_pedido
      WHERE pedido_id = $1 ORDER BY created_at DESC LIMIT 100`, [order.id]);
    return { protectedReference: order.code, ...current, changeRequests,
      deliveryTurn: current.status === PublicTrackingStatus.IN_ROUTE ? current.pendingPriorStops + 1 : null,
      lastUpdatedAt: history.at(-1)?.occurredAt ?? order.updatedAt,
      history: history.map((item) => ({ status: item.visibleStatus, pendingPriorStops: item.pendingPriorStops,
        estimatedFrom: item.estimatedFrom, estimatedUntil: item.estimatedUntil, occurredAt: item.occurredAt })),
    };
  }

  private async project(order: Order) {
    const rows: Array<{ estado: PublicTrackingStatus }> = await this.dataSource.query('SELECT estado FROM pedido_flujo_actual WHERE pedido_id = $1', [order.id]);
    const status = rows[0]?.estado ?? PublicTrackingStatus.ORDER_CONFIRMED;
    const delivery = await this.deliveries.findOne({ where: { orderId: order.id }, relations: { route: true, result: true }, order: { createdAt: 'DESC' } });
    const estimate = status === PublicTrackingStatus.IN_ROUTE ? await this.estimate(delivery, order.address.zoneId)
      : { pendingPriorStops: 0, estimatedFrom: null, estimatedUntil: null };
    return { status, ...estimate };
  }

  private async estimate(delivery: RouteDelivery | null, zoneId: string | null): Promise<{ pendingPriorStops: number; estimatedFrom: Date | null; estimatedUntil: Date | null }> {
    if (!delivery || !delivery.route || !delivery.route.departedAt || !delivery.position || delivery.result) return { pendingPriorStops: 0, estimatedFrom: null, estimatedUntil: null };
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

  async requestChange(token: string, message: string, clientKey: string) {
    this.rateLimit(`request:${clientKey}`);
    if (message.trim().length < 5) throw new BadRequestException('Describe la solicitud con al menos cinco caracteres');
    const link = await this.links.findOne({ where: [{ tokenHash: this.hash(token), status: TrackingLinkStatus.ACTIVE }, { legacyTokenHash: this.hash(token), status: TrackingLinkStatus.ACTIVE }] });
    if (!link || link.expiresAt <= new Date()) throw new NotFoundException('El enlace de seguimiento no está disponible');
    const order = await this.loadOrder(link.orderId);
    if (order.status === OrderStatus.CANCELED) throw new ConflictException('El pedido está cancelado');
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`request:${order.id}`]);
      const existing = await manager.query(`SELECT id, estado FROM solicitudes_cambio_pedido
        WHERE pedido_id = $1 AND estado = 'PENDIENTE' AND mensaje = $2 LIMIT 1`, [order.id, message.trim()]);
      if (existing.length) return existing[0];
      const rows = await manager.query(`INSERT INTO solicitudes_cambio_pedido (pedido_id, mensaje) VALUES ($1, $2)
        RETURNING id, estado`, [order.id, message.trim()]);
      return rows[0];
    });
  }

  async changeRequests() {
    return this.dataSource.query(`SELECT r.id, r.pedido_id AS "orderId", o.codigo AS "orderCode",
      c.nombre_razon_social AS "customerName", r.mensaje AS message, r.estado AS status, r.respuesta AS response,
      r.created_at AS "createdAt", r.resuelto_at AS "resolvedAt"
      FROM solicitudes_cambio_pedido r JOIN pedidos o ON o.id = r.pedido_id JOIN clientes c ON c.id = o.cliente_id
      ORDER BY (r.estado = 'PENDIENTE') DESC, r.created_at DESC LIMIT 200`);
  }

  async resolveChangeRequest(id: string, response: string, actor: AuthenticatedUser) {
    if (response.trim().length < 5) throw new BadRequestException('Describe la resolución con al menos cinco caracteres');
    const rows = await this.dataSource.query(`UPDATE solicitudes_cambio_pedido SET estado = 'RESUELTA', respuesta = $2,
      resuelto_por = $3, resuelto_at = now() WHERE id = $1 AND estado = 'PENDIENTE' RETURNING id`, [id, response.trim(), actor.id]);
    if (!rows.length) throw new ConflictException('La solicitud no existe o ya fue resuelta');
    await this.audit.record({ userId: actor.id, module: 'orders', action: 'RESOLVER_SOLICITUD_CAMBIO',
      entity: 'solicitudes_cambio_pedido', entityId: id, result: 'EXITOSO', metadata: { response: response.trim() } });
    return { resolved: true };
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
