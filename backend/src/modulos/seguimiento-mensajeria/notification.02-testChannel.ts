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
import { NotificationServiceParte03 } from './notification.03-enqueuePayment';

export abstract class NotificationServiceParte02 extends NotificationServiceParte03 {
  async testChannel(dto: TestNotificationChannelDto, actor: AuthenticatedUser): Promise<ChannelTestLog> {
      const startedAt = Date.now();
      const channel = await this.activeChannelWithCredential();
      if (!channel) {
        return this.saveChannelTestLog({
          channelId: null,
          actor,
          number: dto.number,
          result: 'ERROR',
          httpStatus: null,
          durationMs: Date.now() - startedAt,
          providerMessageId: null,
          response: { message: 'No existe un canal de WhatsApp activo' },
          error: 'No existe un canal de WhatsApp activo',
        });
      }
  
      try {
        if (!channel.encryptedToken) throw new ServiceUnavailableException('El token de LimiteAPI no está configurado');
        const token = this.channelTokenCipher.decrypt(channel.encryptedToken);
        const providerResult = await this.provider.send(channel, dto.number, dto.body.trim(), token);
        return this.saveChannelTestLog({
          channelId: channel.id,
          actor,
          number: dto.number,
          result: providerResult.ok ? 'EXITOSO' : 'ERROR',
          httpStatus: providerResult.status,
          durationMs: Date.now() - startedAt,
          providerMessageId: providerResult.messageId,
          response: providerResult.response,
          error: providerResult.error,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Configuración de LimiteAPI no disponible';
        return this.saveChannelTestLog({
          channelId: channel.id,
          actor,
          number: dto.number,
          result: 'ERROR',
          httpStatus: null,
          durationMs: Date.now() - startedAt,
          providerMessageId: null,
          response: { message },
          error: message,
        });
      }
    }

  async enqueue(order: Order, link: TrackingLink | null, event: NotificationEvent, version: number, variables: TemplateVariables, eventKey?: string): Promise<Notification | null> {
      if (!await this.eventEnabled(event)) return null;
      const template = (await this.ensureSystemTemplate(event, order.createdById)).template;
      return this.enqueueWithTemplate(order, link, template, event, version, variables, `${order.id}:${event}:${eventKey ?? version}`);
    }

  async safeEnqueueOrderLifecycle(
      order: Order,
      event: NotificationEvent.ORDER_DRAFT | NotificationEvent.ORDER_RECEIVED | NotificationEvent.ORDER_CONFIRMED | NotificationEvent.ORDER_CANCELED,
      createdById: string,
      variables: Partial<TemplateVariables>,
    ): Promise<void> {
      try {
        if (!await this.eventEnabled(event)) return;
        const template = await this.lifecycleTemplate(event, createdById);
        await this.enqueueWithTemplate(
          order,
          null,
          template,
          event,
          1,
          this.completeVariables(order, variables),
          `${order.id}:${event}:lifecycle`,
        );
      } catch (error) {
        await this.audit.record({
          userId: createdById,
          module: 'notifications',
          action: 'ENCOLAR_MENSAJE_PEDIDO',
          entity: 'pedidos',
          entityId: order.id,
          result: 'ERROR',
          metadata: { event, message: error instanceof Error ? error.message : 'Error no identificado' },
        }).catch(() => undefined);
      }
    }

  protected async enqueueWithTemplate(
      order: Order,
      link: TrackingLink | null,
      template: NotificationTemplate,
      event: NotificationEvent,
      version: number,
      variables: TemplateVariables,
      key: string,
    ): Promise<Notification | null> {
      const recipient = this.normalizeRecipient(order.customer.whatsapp || order.customer.phone);
      if (!recipient) return null;
      const idempotencyKey = event === NotificationEvent.NEXT_DELIVERY
        ? `${order.id}:${event}:threshold`
        : key;
      const existing = await this.notifications.findOne({ where: { idempotencyKey } });
      if (existing) return existing;
      const renderedBody = this.renderLifecycleRequirements(this.render(template, variables), template, event, variables);
      try {
        return await this.notifications.save(this.notifications.create({
          orderId: order.id,
          paymentCode: null,
          customerId: order.customerId,
          linkId: link?.id ?? null,
          templateId: template.id,
          resentFromId: null,
          recipient,
          event,
          renderedBody,
          idempotencyKey,
          eventVersion: version,
          status: NotificationStatus.PENDING,
          scheduledAt: new Date(),
          nextAttemptAt: new Date(),
          processedAt: null,
          providerMessageId: null,
          lastError: null,
        }));
      } catch (error) {
        const duplicate = await this.notifications.findOne({ where: { idempotencyKey } });
        if (duplicate) return duplicate;
        throw error;
      }
    }
}
