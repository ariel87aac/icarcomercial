import { ServiceUnavailableException } from '@nestjs/common';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { Order } from '../pedidos/entidades/order.entity';
import { TestNotificationChannelDto } from './dto/tracking.dto';
import { ChannelTestLog } from './entidades/channel-test-log.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { Notification } from './entidades/notification.entity';
import { NotificationEvent, NotificationStatus } from './entidades/tracking.enums';
import { TrackingLink } from './entidades/tracking-link.entity';
import { NotificationServiceParte03 } from './notification.03-enqueuePayment';

export const AUTHORIZED_TEMPLATE_VARIABLES = ['trackingUrl', 'orderReference', 'publicStatus', 'pendingStops', 'estimatedFrom', 'estimatedUntil', 'customerName', 'confirmationUrl', 'productList', 'orderTotal', 'deliveryDate', 'cancellationReason'] as const;

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
    if (!(await this.eventEnabled(event))) return null;
    if (!(await this.channelSendingEnabled())) return null;
    const template = (await this.ensureSystemTemplate(event, order.createdById)).template;
    return this.enqueueWithTemplate(order, link, template, event, version, variables, `${order.id}:${event}:${eventKey ?? version}`);
  }

  async safeEnqueueOrderLifecycle(order: Order, event: NotificationEvent.ORDER_DRAFT | NotificationEvent.ORDER_RECEIVED | NotificationEvent.ORDER_CONFIRMED | NotificationEvent.ORDER_CANCELED, createdById: string, variables: Partial<TemplateVariables>, transitionKey = 'lifecycle'): Promise<void> {
    try {
      if (!(await this.eventEnabled(event))) return;
      if (!(await this.channelSendingEnabled())) return;
      const template = await this.lifecycleTemplate(event, createdById);
      await this.enqueueWithTemplate(order, null, template, event, 1, this.completeVariables(order, variables), `${order.id}:${event}:${transitionKey}`);
    } catch (error) {
      await this.audit
        .record({
          userId: createdById,
          module: 'notifications',
          action: 'ENCOLAR_MENSAJE_PEDIDO',
          entity: 'pedidos',
          entityId: order.id,
          result: 'ERROR',
          metadata: {
            event,
            message: error instanceof Error ? error.message : 'Error no identificado',
          },
        })
        .catch(() => undefined);
    }
  }

  protected async enqueueWithTemplate(order: Order, link: TrackingLink | null, template: NotificationTemplate, event: NotificationEvent, version: number, variables: TemplateVariables, key: string): Promise<Notification | null> {
    const recipient = this.normalizeRecipient(order.customer.whatsapp || order.customer.phone, order.customer.countryCode);
    if (!recipient) return null;
    const idempotencyKey = event === NotificationEvent.NEXT_DELIVERY ? `${order.id}:${event}:threshold` : key;
    const existing = await this.notifications.findOne({
      where: { idempotencyKey },
    });
    if (existing) return existing;
    const renderedBody = this.renderLifecycleRequirements(this.render(template, variables), template, event, variables);
    try {
      return await this.notifications.save(
        this.notifications.create({
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
        }),
      );
    } catch (error) {
      const duplicate = await this.notifications.findOne({
        where: { idempotencyKey },
      });
      if (duplicate) return duplicate;
      throw error;
    }
  }
}
