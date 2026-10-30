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
import { TrackingServiceParte03 } from './tracking.03-publicBaseUrl';

export abstract class TrackingServiceParte02 extends TrackingServiceParte03 {
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

  protected async sendUpdate(update: TrackingUpdate): Promise<void> {
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

  protected statusEvent(status: PublicTrackingStatus): NotificationEvent | null {
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

  protected async snapshot(_link: TrackingLink, order: Order): Promise<TrackingSnapshot> {
      return this.currentWithoutLink(order);
    }

  protected async currentWithoutLink(order: Order): Promise<TrackingSnapshot> {
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

  protected async project(order: Order) {
      const rows: Array<{ estado: PublicTrackingStatus }> = await this.dataSource.query('SELECT estado FROM pedido_flujo_actual WHERE pedido_id = $1', [order.id]);
      const status = rows[0]?.estado ?? PublicTrackingStatus.ORDER_CONFIRMED;
      const delivery = await this.deliveries.findOne({ where: { orderId: order.id }, relations: { route: true, result: true }, order: { createdAt: 'DESC' } });
      const estimate = status === PublicTrackingStatus.IN_ROUTE ? await this.estimate(delivery, order.address.zoneId)
        : { pendingPriorStops: 0, estimatedFrom: null, estimatedUntil: null };
      return { status, ...estimate };
    }

  protected async estimate(delivery: RouteDelivery | null, zoneId: string | null): Promise<{ pendingPriorStops: number; estimatedFrom: Date | null; estimatedUntil: Date | null }> {
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

  protected eventVersion(sourceEvent: string): number {
      const hash = createHash('sha256').update(sourceEvent).digest();
      return Math.max(1, hash.readUInt32BE(0) % 2_147_483_647);
    }

  protected async loadOrder(id: string): Promise<Order> {
      const order = await this.orders.findOne({ where: { id }, relations: { customer: true, address: { zone: true } } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      return order;
    }

  protected hash(token: string): string {
      return createHash('sha256').update(token).digest('hex');
    }

  protected effectiveStatus(link: TrackingLink): TrackingLinkStatus {
      return link.status === TrackingLinkStatus.ACTIVE && link.expiresAt <= new Date() ? TrackingLinkStatus.EXPIRED : link.status;
    }
}
