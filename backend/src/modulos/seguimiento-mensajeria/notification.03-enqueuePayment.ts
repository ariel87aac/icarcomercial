import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { NotificationQueryDto } from './dto/tracking.dto';
import { Notification } from './entidades/notification.entity';
import { NotificationEvent, NotificationStatus } from './entidades/tracking.enums';
import { Payment } from '../ventas-cobranzas/entidades/payment.entity';
import { NotificationServiceProcessNext } from './notification.03-processNext';

export const AUTHORIZED_TEMPLATE_VARIABLES = ['trackingUrl', 'orderReference', 'publicStatus', 'pendingStops', 'estimatedFrom', 'estimatedUntil', 'customerName', 'confirmationUrl', 'productList', 'orderTotal', 'deliveryDate', 'cancellationReason'] as const;

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

export abstract class NotificationServiceParte03 extends NotificationServiceProcessNext {
  async enqueuePayment(payment: Payment, version: number): Promise<Notification | null> {
    if (!(await this.eventEnabled(NotificationEvent.PAYMENT_RECEIVED))) return null;
    if (!(await this.channelSendingEnabled())) return null;
    const order = payment.applications.find((application) => application.sale?.order)?.sale.order;
    if (!order) throw new BadRequestException('El cobro confirmado no tiene un pedido relacionado');
    const template = (await this.ensureSystemTemplate(NotificationEvent.PAYMENT_RECEIVED, payment.confirmedById ?? payment.registeredById)).template;
    const recipient = this.normalizeRecipient(payment.customer.whatsapp || payment.customer.phone, payment.customer.countryCode);
    if (!recipient) return null;
    const key = `${payment.id}:${NotificationEvent.PAYMENT_RECEIVED}:${version}`;
    const existing = await this.notifications.findOne({
      where: { idempotencyKey: key },
    });
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
      return await this.notifications.save(
        this.notifications.create({
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
        }),
      );
    } catch (error) {
      const duplicate = await this.notifications.findOne({
        where: { idempotencyKey: key },
      });
      if (duplicate) return duplicate;
      throw error;
    }
  }

  async findAll(query: NotificationQueryDto) {
    const builder = this.notifications
      .createQueryBuilder('notification')
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
    if (query.status)
      builder.andWhere('notification.status = :status', {
        status: query.status,
      });
    if (query.customerId)
      builder.andWhere('notification.customerId = :customerId', {
        customerId: query.customerId,
      });
    if (query.orderId)
      builder.andWhere('notification.orderId = :orderId', {
        orderId: query.orderId,
      });
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Notification> {
    const item = await this.notifications.findOne({
      where: { id },
      relations: {
        order: true,
        customer: true,
        template: true,
        resentFrom: true,
        attempts: true,
      },
    });
    if (!item) throw new NotFoundException('Notificación no encontrada');
    item.attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
    return item;
  }

  async resend(id: string, actor: AuthenticatedUser): Promise<Notification> {
    if (!(await this.channelSendingEnabled())) {
      throw new BadRequestException('El envío de mensajes está deshabilitado');
    }
    const original = await this.findOne(id);
    const item = await this.notifications.save(
      this.notifications.create({
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
      }),
    );
    await this.audit.record({
      userId: actor.id,
      module: 'notifications',
      action: 'REENVIAR_NOTIFICACION',
      entity: 'notificaciones',
      entityId: item.id,
      result: 'EXITOSO',
      metadata: {
        previousNotificationId: original.id,
        orderId: original.orderId,
        event: original.event,
      },
    });
    return this.findOne(item.id);
  }
}
