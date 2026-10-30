import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Brackets, DataSource, Repository } from 'typeorm';
import { paginate, PaginationQueryDto } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { sanitizeSecrets } from '../../compartido/utilidades/secret-sanitizer.util';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { Order } from '../pedidos/entidades/order.entity';
import { SaveChannelSettingDto, NotificationQueryDto, SaveEstimationSettingDto, SaveNotificationTemplateDto, TestNotificationChannelDto, WebhookDto } from './dto/tracking.dto';
import { ChannelSetting } from './entidades/channel-setting.entity';
import { ChannelTestLog } from './entidades/channel-test-log.entity';
import { EstimationSetting } from './entidades/estimation-setting.entity';
import { NotificationAttempt } from './entidades/notification-attempt.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { NotificationWebhook } from './entidades/notification-webhook.entity';
import { Notification } from './entidades/notification.entity';
import { NotificationAttemptStatus, NotificationEvent, NotificationStatus } from './entidades/tracking.enums';
import { TrackingLink } from './entidades/tracking-link.entity';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { LimiteApiAdapter } from './limite-api.adapter';
import { Payment } from '../ventas-cobranzas/entidades/payment.entity';

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

interface SystemTemplateDefinition {
  reference: string;
  body: string;
  variables: string[];
}

const SYSTEM_NOTIFICATION_TEMPLATES: Record<NotificationEvent, SystemTemplateDefinition> = {
  [NotificationEvent.IN_PREPARATION]: { reference: 'EN_PREPARACION_SISTEMA', body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} está en preparación; estamos completando sus productos.', variables: ['customerName','orderReference'] },
  [NotificationEvent.STOCK_READY]: { reference: 'DISPONIBLE_PREPARAR_SISTEMA', body: 'Hola {{customerName}}, todos los productos de tu pedido N° {{orderReference}} están disponibles para preparar.', variables: ['customerName','orderReference'] },
  [NotificationEvent.PREPARED]: { reference: 'PREPARADO_SISTEMA', body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} está preparado y fue entregado a Distribución.', variables: ['customerName','orderReference'] },
  [NotificationEvent.ASSIGNED]: { reference: 'ASIGNADO_SISTEMA', body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} fue asignado a una ruta. Te avisaremos cuando esté en camino.', variables: ['customerName','orderReference'] },
  [NotificationEvent.PARTIAL]: { reference: 'ENTREGA_PARCIAL_SISTEMA', body: 'Hola {{customerName}}, registramos una entrega parcial de tu pedido N° {{orderReference}}. Puedes solicitar atención desde el seguimiento.', variables: ['customerName','orderReference'] },
  [NotificationEvent.ORDER_DRAFT]: {
    reference: 'PEDIDO_BORRADOR_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} fue creado en estado borrador.\n\nProductos:\n{{productList}}\n\nTotal: Bs {{orderTotal}}\nFecha de entrega: {{deliveryDate}}\n\nConfirma tu pedido aquí: {{confirmationUrl}}',
    variables: ['customerName', 'orderReference', 'productList', 'orderTotal', 'deliveryDate', 'confirmationUrl'],
  },
  [NotificationEvent.ORDER_RECEIVED]: {
    reference: 'PEDIDO_RECIBIDO_SISTEMA',
    body: 'Hola {{customerName}}, recibimos tu pedido N° {{orderReference}} y se encuentra en revisión.\n\nProductos:\n{{productList}}\n\nTotal: Bs {{orderTotal}}\nFecha de entrega: {{deliveryDate}}',
    variables: ['customerName', 'orderReference', 'productList', 'orderTotal', 'deliveryDate'],
  },
  [NotificationEvent.ORDER_CONFIRMED]: {
    reference: 'PEDIDO_CONFIRMADO_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} fue confirmado.\n\nProductos confirmados:\n{{productList}}\n\nTotal: Bs {{orderTotal}}\nFecha de entrega: {{deliveryDate}}',
    variables: ['customerName', 'orderReference', 'productList', 'orderTotal', 'deliveryDate'],
  },
  [NotificationEvent.ORDER_CANCELED]: {
    reference: 'PEDIDO_CANCELADO_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} fue cancelado.\nMotivo: {{cancellationReason}}',
    variables: ['customerName', 'orderReference', 'cancellationReason'],
  },
  [NotificationEvent.RELEVANT_CHANGE]: {
    reference: 'CAMBIO_RELEVANTE_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} cambió al estado {{publicStatus}}.',
    variables: ['customerName', 'orderReference', 'publicStatus'],
  },
  [NotificationEvent.ROUTE_DEPARTURE]: {
    reference: 'SALIDA_RUTA_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} está en camino. Consulta tu turno actualizado en el enlace de seguimiento.',
    variables: ['customerName', 'orderReference', 'estimatedFrom', 'estimatedUntil'],
  },
  [NotificationEvent.NEXT_DELIVERY]: {
    reference: 'PROXIMA_ENTREGA_SISTEMA',
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} está próximo a entregarse. Paradas previas: {{pendingStops}}. Ventana estimada: {{estimatedFrom}} a {{estimatedUntil}}.',
    variables: ['customerName', 'orderReference', 'pendingStops', 'estimatedFrom', 'estimatedUntil'],
  },
  [NotificationEvent.DELIVERED]: {
    reference: 'PEDIDO_ENTREGADO_SISTEMA',
    body: 'Hola {{customerName}}, registramos la entrega de tu pedido N° {{orderReference}}. Gracias por elegir ICAR.',
    variables: ['customerName', 'orderReference'],
  },
  [NotificationEvent.DELIVERY_NOT_COMPLETED]: {
    reference: 'ENTREGA_NO_COMPLETADA_SISTEMA',
    body: 'Hola {{customerName}}, no fue posible completar la entrega de tu pedido N° {{orderReference}}. Nuestro equipo revisará el caso.',
    variables: ['customerName', 'orderReference'],
  },
  [NotificationEvent.PAYMENT_RECEIVED]: {
    reference: 'PAGO_RECIBIDO_SISTEMA',
    body: 'Hola {{customerName}}, registramos el pago asociado a tu pedido N° {{orderReference}}.',
    variables: ['customerName', 'orderReference'],
  },
};

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
import { NotificationServiceBase } from './notification.base';

export abstract class NotificationServiceParte05 extends NotificationServiceBase {
  protected async ensureSystemTemplate(event: NotificationEvent, createdById: string): Promise<{ template: NotificationTemplate; created: boolean }> {
      const existing = await this.templates.findOne({ where: { event, active: true }, order: { version: 'DESC' } });
      if (existing) return { template: existing, created: false };
      const definition = SYSTEM_NOTIFICATION_TEMPLATES[event];
      const inactiveSystemTemplate = await this.templates.findOne({
        where: { event, reference: definition.reference, version: 1 },
      });
      if (inactiveSystemTemplate) {
        inactiveSystemTemplate.active = true;
        inactiveSystemTemplate.createdById = createdById;
        return { template: await this.templates.save(inactiveSystemTemplate), created: false };
      }
      try {
        const template = await this.templates.save(this.templates.create({
          event,
          reference: definition.reference,
          version: 1,
          body: definition.body,
          allowedVariables: definition.variables,
          active: true,
          createdById,
        }));
        return { template, created: true };
      } catch (error) {
        const concurrent = await this.templates.findOne({ where: { event, active: true }, order: { version: 'DESC' } });
        if (concurrent) return { template: concurrent, created: false };
        throw error;
      }
    }

  protected normalizeRecipient(value: string): string | null {
      const normalized = value.replace(/\D/g, '');
      return /^\d{8,15}$/.test(normalized) ? normalized : null;
    }

  protected activeChannelWithCredential(): Promise<ChannelSetting | null> {
      return this.channels.createQueryBuilder('channel')
        .addSelect('channel.encryptedToken')
        .leftJoinAndSelect('channel.updatedBy', 'updatedBy')
        .where('channel.active = true')
        .orderBy('channel.updatedAt', 'DESC')
        .getOne();
    }

  protected toChannelView(channel: ChannelSetting): ChannelSettingView {
      return {
        id: channel.id,
        provider: channel.provider,
        apiUrl: channel.apiUrl,
        tokenMasked: channel.tokenLast3 ? `${'•'.repeat(9)}${channel.tokenLast3}` : null,
        tokenConfigured: Boolean(channel.tokenLast3),
        enabledNumber: channel.enabledNumber,
        licenseReference: channel.licenseReference,
        timeoutMs: channel.timeoutMs,
        maxRetries: channel.maxRetries,
        retryDelaySeconds: channel.retryDelaySeconds,
        active: channel.active,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        updatedBy: { id: channel.updatedBy.id, name: channel.updatedBy.name },
      };
    }

  protected async saveChannelTestLog(input: {
      channelId: string | null;
      actor: AuthenticatedUser;
      number: string;
      result: 'EXITOSO' | 'ERROR';
      httpStatus: number | null;
      durationMs: number;
      providerMessageId: string | null;
      response: Record<string, unknown>;
      error: string | null;
    }): Promise<ChannelTestLog> {
      const item = await this.channelTestLogs.save(this.channelTestLogs.create({
        channelId: input.channelId,
        testedById: input.actor.id,
        maskedRecipient: this.maskRecipient(input.number),
        result: input.result,
        httpStatus: input.httpStatus,
        durationMs: input.durationMs,
        providerMessageId: input.providerMessageId,
        sanitizedResponse: (sanitizeSecrets(input.response) ?? {}) as Record<string, unknown>,
        error: input.error?.slice(0, 500) ?? null,
      }));
      await this.audit.record({
        userId: input.actor.id,
        module: 'notifications',
        action: 'PROBAR_CANAL',
        entity: 'registros_prueba_canal',
        entityId: item.id,
        result: input.result,
        metadata: {
          channelId: input.channelId,
          httpStatus: input.httpStatus,
          durationMs: input.durationMs,
          providerMessageId: input.providerMessageId,
          error: input.error,
        },
      });
      return this.channelTestLogs.findOneOrFail({ where: { id: item.id }, relations: { testedBy: true } });
    }

  protected maskRecipient(value: string): string {
      const normalized = value.replace(/\D/g, '');
      if (normalized.length <= 4) return '•'.repeat(normalized.length);
      return `${'•'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
    }

  protected async finishFailure(item: Notification, status: number | null, response: Record<string, unknown>, error: string, recoverable: boolean, maxRetries: number, retryDelaySeconds = 60): Promise<void> {
      const attemptNumber = item.attempts.length + 1;
      const willRetry = recoverable && attemptNumber <= maxRetries;
      await this.attempts.save(this.attempts.create({ notificationId: item.id, attemptNumber, status: willRetry ? NotificationAttemptStatus.RECOVERABLE_FAILURE : NotificationAttemptStatus.DEFINITIVE_FAILURE, httpStatus: status, sanitizedResponse: response }));
      item.status = willRetry ? NotificationStatus.RETRY : NotificationStatus.FAILED;
      item.nextAttemptAt = new Date(Date.now() + retryDelaySeconds * 1000);
      item.processedAt = willRetry ? null : new Date();
      item.lastError = error.slice(0, 500);
      await this.notifications.save(item);
    }

  protected assertWebhookAuthorization(value: string | undefined): void {
      const expected = this.config.get<string>('WHATSAPP_WEBHOOK_TOKEN', '').trim();
      if (!expected) throw new ServiceUnavailableException('La validación del webhook no está configurada');
      const received = value?.startsWith('Bearer ') ? value.slice(7) : '';
      const a = Buffer.from(expected);
      const b = Buffer.from(received);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Webhook no autorizado');
    }
}
