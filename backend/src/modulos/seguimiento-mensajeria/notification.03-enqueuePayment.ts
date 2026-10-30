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
import { NotificationServiceParte04 } from './notification.04-recoverInterruptedProcessing';

export abstract class NotificationServiceParte03 extends NotificationServiceParte04 {
  async enqueuePayment(payment: Payment, version: number): Promise<Notification | null> {
      if (!await this.eventEnabled(NotificationEvent.PAYMENT_RECEIVED)) return null;
      const order = payment.applications.find((application) => application.sale?.order)?.sale.order;
      if (!order) throw new BadRequestException('El cobro confirmado no tiene un pedido relacionado');
      const template = (await this.ensureSystemTemplate(
        NotificationEvent.PAYMENT_RECEIVED,
        payment.confirmedById ?? payment.registeredById,
      )).template;
      const recipient = this.normalizeRecipient(payment.customer.whatsapp || payment.customer.phone);
      if (!recipient) return null;
      const key = `${payment.id}:${NotificationEvent.PAYMENT_RECEIVED}:${version}`;
      const existing = await this.notifications.findOne({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const renderedBody = this.render(template, {
        trackingUrl: '',
        orderReference: order.code,
        publicStatus: '',
        pendingStops: '',
        estimatedFrom: '',
        estimatedUntil: '',
        customerName: payment.customer.businessName,
      });
      try {
        return await this.notifications.save(this.notifications.create({
          orderId: order.id,
          paymentCode: payment.code,
          customerId: payment.customerId,
          linkId: null,
          templateId: template.id,
          resentFromId: null,
          recipient,
          event: NotificationEvent.PAYMENT_RECEIVED,
          renderedBody,
          idempotencyKey: key,
          eventVersion: version,
          status: NotificationStatus.PENDING,
          scheduledAt: new Date(),
          nextAttemptAt: new Date(),
          processedAt: null,
          providerMessageId: null,
          lastError: null,
        }));
      } catch (error) {
        const duplicate = await this.notifications.findOne({ where: { idempotencyKey: key } });
        if (duplicate) return duplicate;
        throw error;
      }
    }

  async findAll(query: NotificationQueryDto) {
      const builder = this.notifications.createQueryBuilder('notification')
        .leftJoinAndSelect('notification.order', 'orders')
        .leftJoinAndSelect('notification.customer', 'customer')
        .leftJoinAndSelect('notification.template', 'template')
        .leftJoinAndSelect('notification.resentFrom', 'resentFrom')
        .orderBy('notification.createdAt', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      if (query.from) builder.andWhere('notification.createdAt >= :from', { from: query.from });
      if (query.to) builder.andWhere('notification.createdAt <= :to', { to: query.to });
      if (query.event) builder.andWhere('notification.event = :event', { event: query.event });
      if (query.status) builder.andWhere('notification.status = :status', { status: query.status });
      if (query.customerId) builder.andWhere('notification.customerId = :customerId', { customerId: query.customerId });
      if (query.orderId) builder.andWhere('notification.orderId = :orderId', { orderId: query.orderId });
      const [items, total] = await builder.getManyAndCount();
      return paginate(items, total, query.page, query.limit);
    }

  async findOne(id: string): Promise<Notification> {
      const item = await this.notifications.findOne({ where: { id }, relations: { order: true, customer: true, template: true, resentFrom: true, attempts: true } });
      if (!item) throw new NotFoundException('Notificación no encontrada');
      item.attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
      return item;
    }

  async resend(id: string, actor: AuthenticatedUser): Promise<Notification> {
      const original = await this.findOne(id);
      const item = await this.notifications.save(this.notifications.create({
        orderId: original.orderId,
        paymentCode: original.paymentCode,
        customerId: original.customerId,
        linkId: original.linkId,
        templateId: original.templateId,
        resentFromId: original.id,
        recipient: original.recipient,
        event: original.event,
        renderedBody: original.renderedBody,
        idempotencyKey: `${original.orderId}:${original.event}:resend:${randomUUID()}`,
        eventVersion: original.eventVersion,
        status: NotificationStatus.PENDING,
        scheduledAt: new Date(),
        nextAttemptAt: new Date(),
        processedAt: null,
        providerMessageId: null,
        lastError: null,
      }));
      await this.audit.record({ userId: actor.id, module: 'notifications', action: 'REENVIAR_NOTIFICACION', entity: 'notificaciones', entityId: item.id, result: 'EXITOSO', metadata: { previousNotificationId: original.id, orderId: original.orderId, event: original.event } });
      return this.findOne(item.id);
    }

  async processNext(): Promise<boolean> {
      const notificationId = await this.dataSource.transaction(async (manager) => {
        const item = await manager.getRepository(Notification).createQueryBuilder('notification')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where('notification.estado IN (:...states)', { states: [NotificationStatus.PENDING, NotificationStatus.RETRY] })
          .andWhere('notification.proximo_intento_at <= now()')
          .orderBy('notification.proximo_intento_at', 'ASC')
          .getOne();
        if (!item) return null;
        item.status = NotificationStatus.PROCESSING;
        await manager.getRepository(Notification).save(item);
        return item.id;
      });
      if (!notificationId) return false;
      const item = await this.findOne(notificationId);
      const channel = await this.activeChannelWithCredential();
      if (!channel) {
        await this.finishFailure(item, null, {}, 'No existe un canal de WhatsApp activo', false, 0);
        return true;
      }
      let result;
      try {
        if (!channel.encryptedToken) throw new ServiceUnavailableException('El token de LimiteAPI no está configurado');
        const token = this.channelTokenCipher.decrypt(channel.encryptedToken);
        result = await this.provider.send(channel, item.recipient, item.renderedBody, token);
      } catch (error) {
        const message = error instanceof ServiceUnavailableException ? error.message : 'Configuración de LimiteAPI no disponible';
        await this.finishFailure(item, null, { message }, message, false, channel.maxRetries);
        return true;
      }
      if (result.ok) {
        const attemptNumber = item.attempts.length + 1;
        await this.attempts.save(this.attempts.create({ notificationId: item.id, attemptNumber, status: NotificationAttemptStatus.SENT, httpStatus: result.status, sanitizedResponse: result.response }));
        item.status = NotificationStatus.SENT;
        item.providerMessageId = result.messageId;
        item.processedAt = new Date();
        item.lastError = null;
        await this.notifications.save(item);
        return true;
      }
      await this.finishFailure(item, result.status, result.response, result.error ?? 'Error de proveedor', result.recoverable, channel.maxRetries, channel.retryDelaySeconds);
      return true;
    }
}
