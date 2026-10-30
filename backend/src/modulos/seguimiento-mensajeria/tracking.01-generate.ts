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
import { TrackingServiceParte02 } from './tracking.02-captureOrder';

export abstract class TrackingServiceParte01 extends TrackingServiceParte02 {
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
}
