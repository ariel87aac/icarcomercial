import { createHash } from 'node:crypto';
import { Brackets } from 'typeorm';
import { sanitizeSecrets } from '../../compartido/utilidades/secret-sanitizer.util';
import { Order } from '../pedidos/entidades/order.entity';
import { WebhookDto } from './dto/tracking.dto';
import { EstimationSetting } from './entidades/estimation-setting.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { NotificationWebhook } from './entidades/notification-webhook.entity';
import { Notification } from './entidades/notification.entity';
import { NotificationAttemptStatus, NotificationEvent, NotificationStatus } from './entidades/tracking.enums';
import { NotificationServiceParte05 } from './notification.05-ensureSystemTemplate';

export const AUTHORIZED_TEMPLATE_VARIABLES = [
  'trackingUrl',
  'orderReference',
  'publicStatus',
  'pendingStops',
  'estimatedFrom',
  'estimatedUntil',
  'customerName',
  'confirmationUrl',
  'productList',
  'orderTotal',
  'deliveryDate',
  'cancellationReason',
] as const;

type TemplateVariables = Partial<Record<(typeof AUTHORIZED_TEMPLATE_VARIABLES)[number], string>>;

export interface ChannelSettingView {
  id: string;
  provider: string;
  apiUrl: string;
  tokenMasked: string | null;
  tokenConfigured: boolean;
  enabledNumber: string;
  licenseReference: string | null;
  timeoutMs: number;
  maxRetries: number;
  retryDelaySeconds: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: { id: string; name: string };
}

export abstract class NotificationServiceParte04 extends NotificationServiceParte05 {
  async recoverInterruptedProcessing(timeoutMs = 60_000): Promise<{ sent: number; retried: number; failed: number }> {
      const cutoff = new Date(Date.now() - Math.max(timeoutMs, 10_000));
      const interrupted = await this.notifications.createQueryBuilder('notification')
        .leftJoinAndSelect('notification.attempts', 'attempt')
        .where('notification.estado = :status', { status: NotificationStatus.PROCESSING })
        .andWhere('notification.updated_at <= :cutoff', { cutoff })
        .getMany();
      const result = { sent: 0, retried: 0, failed: 0 };
  
      for (const notification of interrupted) {
        const latestAttempt = [...notification.attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
        let status: NotificationStatus;
        let processedAt: Date | null;
        let nextAttemptAt = notification.nextAttemptAt;
        let lastError: string | null;
  
        if (latestAttempt?.status === NotificationAttemptStatus.SENT) {
          status = NotificationStatus.SENT;
          processedAt = latestAttempt.occurredAt;
          lastError = null;
        } else if (latestAttempt?.status === NotificationAttemptStatus.RECOVERABLE_FAILURE) {
          status = NotificationStatus.RETRY;
          processedAt = null;
          nextAttemptAt = new Date();
          lastError = 'Reintento recuperado después de reiniciar el trabajador de mensajería';
        } else {
          status = NotificationStatus.FAILED;
          processedAt = latestAttempt?.occurredAt ?? new Date();
          lastError = latestAttempt
            ? 'Fallo definitivo recuperado después de reiniciar el trabajador de mensajería'
            : 'Envío interrumpido con resultado indeterminado; requiere reenvío manual';
        }
  
        const update = await this.notifications.createQueryBuilder()
          .update(Notification)
          .set({ status, processedAt, nextAttemptAt, lastError })
          .where('id = :id', { id: notification.id })
          .andWhere('estado = :processing', { processing: NotificationStatus.PROCESSING })
          .execute();
        if (!update.affected) continue;
        if (status === NotificationStatus.SENT) result.sent += 1;
        else if (status === NotificationStatus.RETRY) result.retried += 1;
        else result.failed += 1;
      }
      return result;
    }

  async webhook(dto: WebhookDto, authorization: string | undefined): Promise<{ accepted: true; duplicate: boolean }> {
      this.assertWebhookAuthorization(authorization);
      const sanitized = (sanitizeSecrets(dto) ?? {}) as Record<string, unknown>;
      const contentHash = createHash('sha256').update(JSON.stringify(sanitized)).digest('hex');
      const duplicate = await this.webhooks.createQueryBuilder('webhook')
        .where('webhook.externalEventId = :eventId OR webhook.contentHash = :contentHash', { eventId: dto.eventId, contentHash })
        .getOne();
      if (duplicate) return { accepted: true, duplicate: true };
      const notification = await this.notifications.findOne({ where: { providerMessageId: dto.messageId } });
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(NotificationWebhook).save(manager.getRepository(NotificationWebhook).create({ externalEventId: dto.eventId, providerMessageId: dto.messageId, contentHash, receivedStatus: dto.status, sanitizedContent: sanitized, eventAt: dto.occurredAt ? new Date(dto.occurredAt) : null, processedAt: new Date() }));
        if (notification) {
          notification.status = dto.status === 'DELIVERED' ? NotificationStatus.DELIVERED : dto.status === 'FAILED' ? NotificationStatus.FAILED : NotificationStatus.SENT;
          notification.processedAt = new Date();
          notification.lastError = dto.status === 'FAILED' ? dto.detail?.trim() || 'Fallo informado por el proveedor' : null;
          await manager.getRepository(Notification).save(notification);
        }
      });
      await this.audit.record({ module: 'notifications', action: 'PROCESAR_WEBHOOK', entity: 'notificaciones_webhooks', entityId: dto.eventId, result: 'EXITOSO', metadata: { providerMessageId: dto.messageId, status: dto.status, notificationId: notification?.id ?? null } });
      return { accepted: true, duplicate: false };
    }

  async activeSetting(zoneId: string | null): Promise<EstimationSetting | null> {
      const builder = this.settings.createQueryBuilder('setting')
        .where('setting.validFrom <= now()')
        .andWhere('(setting.validUntil IS NULL OR setting.validUntil > now())')
        .andWhere(new Brackets((where) => {
          if (zoneId) where.where('setting.zoneId = :zoneId', { zoneId }).orWhere('setting.zoneId IS NULL');
          else where.where('setting.zoneId IS NULL');
        }))
        .orderBy('CASE WHEN setting.zoneId IS NULL THEN 1 ELSE 0 END', 'ASC')
        .addOrderBy('setting.validFrom', 'DESC');
      return builder.getOne();
    }

  protected render(template: NotificationTemplate, variables: TemplateVariables): string {
      let body = template.body;
      for (const variable of template.allowedVariables) {
        body = body.replace(new RegExp(`{{\\s*${variable}\\s*}}`, 'g'), variables[variable as keyof TemplateVariables] ?? '');
      }
      return body;
    }

  protected renderLifecycleRequirements(
      body: string,
      template: NotificationTemplate,
      event: NotificationEvent,
      variables: TemplateVariables,
    ): string {
      const additions: string[] = [];
      if (variables.trackingUrl && !body.includes(variables.trackingUrl)) additions.push(`Seguimiento de tu pedido: ${variables.trackingUrl}`);
      if (event === NotificationEvent.DELIVERED) additions.push('Si no estás conforme, puedes solicitar una modificación o cambio de productos desde el enlace de seguimiento.');
      if (
        [NotificationEvent.ORDER_DRAFT, NotificationEvent.ORDER_RECEIVED, NotificationEvent.ORDER_CONFIRMED].includes(event)
        && variables.productList
        && !template.allowedVariables.includes('productList')
      ) {
        additions.push(`${event === NotificationEvent.ORDER_CONFIRMED ? 'Productos confirmados' : 'Productos'}:\n${variables.productList}`);
      }
      if (
        [NotificationEvent.ORDER_DRAFT, NotificationEvent.ORDER_RECEIVED].includes(event)
        && variables.confirmationUrl
        && !body.includes(variables.confirmationUrl)
      ) {
        additions.push(`Aprueba tu pedido aquí: ${variables.confirmationUrl}`);
      }
      if (
        event === NotificationEvent.ORDER_CANCELED
        && variables.cancellationReason
        && !template.allowedVariables.includes('cancellationReason')
      ) {
        additions.push(`Motivo: ${variables.cancellationReason}`);
      }
      return additions.length ? `${body.trim()}\n\n${additions.join('\n\n')}` : body;
    }

  protected completeVariables(order: Order, variables: Partial<TemplateVariables>): TemplateVariables {
      return {
        trackingUrl: '',
        orderReference: order.code,
        publicStatus: order.status,
        pendingStops: '',
        estimatedFrom: '',
        estimatedUntil: '',
        customerName: order.customer.businessName,
        confirmationUrl: '',
        productList: '',
        orderTotal: order.total,
        deliveryDate: order.requestedDate,
        cancellationReason: order.cancellationReason ?? '',
        ...variables,
      };
    }

  protected async lifecycleTemplate(
      event: NotificationEvent.ORDER_DRAFT | NotificationEvent.ORDER_RECEIVED | NotificationEvent.ORDER_CONFIRMED | NotificationEvent.ORDER_CANCELED,
      createdById: string,
    ): Promise<NotificationTemplate> {
      return (await this.ensureSystemTemplate(event, createdById)).template;
    }
}
