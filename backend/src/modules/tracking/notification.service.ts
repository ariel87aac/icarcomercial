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
import { paginate, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { sanitizeSecrets } from '../../common/utils/secret-sanitizer.util';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { Order } from '../orders/entities/order.entity';
import { SaveChannelSettingDto, NotificationQueryDto, SaveEstimationSettingDto, SaveNotificationTemplateDto, TestNotificationChannelDto, WebhookDto } from './dto/tracking.dto';
import { ChannelSetting } from './entities/channel-setting.entity';
import { ChannelTestLog } from './entities/channel-test-log.entity';
import { EstimationSetting } from './entities/estimation-setting.entity';
import { NotificationAttempt } from './entities/notification-attempt.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationWebhook } from './entities/notification-webhook.entity';
import { Notification } from './entities/notification.entity';
import { NotificationAttemptStatus, NotificationEvent, NotificationStatus } from './entities/tracking.enums';
import { TrackingLink } from './entities/tracking-link.entity';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { LimiteApiAdapter } from './limite-api.adapter';
import { Payment } from '../commercial/entities/payment.entity';

export const AUTHORIZED_TEMPLATE_VARIABLES = [
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
    body: 'Hola {{customerName}}, tu pedido N° {{orderReference}} salió a distribución. Ventana estimada: {{estimatedFrom}} a {{estimatedUntil}}.',
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

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationTemplate) private readonly templates: Repository<NotificationTemplate>,
    @InjectRepository(EstimationSetting) private readonly settings: Repository<EstimationSetting>,
    @InjectRepository(ChannelSetting) private readonly channels: Repository<ChannelSetting>,
    @InjectRepository(ChannelTestLog) private readonly channelTestLogs: Repository<ChannelTestLog>,
    @InjectRepository(NotificationAttempt) private readonly attempts: Repository<NotificationAttempt>,
    @InjectRepository(NotificationWebhook) private readonly webhooks: Repository<NotificationWebhook>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly provider: LimiteApiAdapter,
    private readonly channelTokenCipher: ChannelTokenCipherService,
    private readonly config: ConfigService,
  ) {}

  async listSettings(): Promise<EstimationSetting[]> {
    return this.settings.find({ relations: { zone: true, createdBy: true }, order: { validFrom: 'DESC' } });
  }

  async saveSetting(dto: SaveEstimationSettingDto, actor: AuthenticatedUser): Promise<EstimationSetting> {
    const id = await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const repository = manager.getRepository(EstimationSetting);
      const builder = repository.createQueryBuilder().update().set({ validUntil: now }).where('vigente_hasta IS NULL');
      dto.zoneId ? builder.andWhere('zona_id = :zoneId', { zoneId: dto.zoneId }) : builder.andWhere('zona_id IS NULL');
      await builder.execute();
      const setting = await repository.save(repository.create({
        zoneId: dto.zoneId ?? null,
        averageStopMinutes: dto.averageStopMinutes,
        toleranceMinutes: dto.toleranceMinutes,
        nextDeliveryThreshold: dto.nextDeliveryThreshold,
        validFrom: now,
        validUntil: null,
        createdById: actor.id,
      }));
      return setting.id;
    });
    await this.audit.record({ userId: actor.id, module: 'tracking', action: 'CONFIGURAR_ESTIMACION', entity: 'configuraciones_estimacion', entityId: id, result: 'EXITOSO', metadata: { zoneId: dto.zoneId ?? null, averageStopMinutes: dto.averageStopMinutes, toleranceMinutes: dto.toleranceMinutes, nextDeliveryThreshold: dto.nextDeliveryThreshold } });
    return this.settings.findOneOrFail({ where: { id }, relations: { zone: true, createdBy: true } });
  }

  async listEventSettings(): Promise<Array<{ event: NotificationEvent; enabled: boolean }>> {
    const rows: Array<{ event: NotificationEvent; enabled: boolean }> = await this.dataSource.query(
      'SELECT evento AS event, habilitado AS enabled FROM notificaciones_eventos_configuracion',
    );
    const configured = new Map(rows.map((row) => [row.event, row.enabled]));
    return Object.values(NotificationEvent).map((event) => ({ event, enabled: configured.get(event) ?? true }));
  }

  async saveEventSetting(event: NotificationEvent, enabled: boolean, actor: AuthenticatedUser) {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`
        INSERT INTO notificaciones_eventos_configuracion (evento, habilitado, actualizado_por)
        VALUES ($1, $2, $3)
        ON CONFLICT (evento) DO UPDATE SET habilitado = EXCLUDED.habilitado,
          actualizado_por = EXCLUDED.actualizado_por, updated_at = now()
      `, [event, enabled, actor.id]);
      const audit = manager.getRepository(AuditEvent);
      await audit.save(audit.create({ userId: actor.id, module: 'notifications',
        action: 'CONFIGURAR_ENVIO_EVENTO', entity: 'notificaciones_eventos_configuracion',
        entityId: event, result: 'EXITOSO', metadata: { event, enabled } }));
    });
    return { event, enabled };
  }

  private async eventEnabled(event: NotificationEvent): Promise<boolean> {
    const rows: Array<{ enabled: boolean }> = await this.dataSource.query(
      'SELECT habilitado AS enabled FROM notificaciones_eventos_configuracion WHERE evento = $1', [event],
    );
    return rows[0]?.enabled ?? true;
  }

  async listTemplates(): Promise<NotificationTemplate[]> {
    return this.templates.find({ relations: { createdBy: true }, order: { event: 'ASC', version: 'DESC' } });
  }

  async ensureDefaultTemplates(actor: AuthenticatedUser): Promise<{ created: number; preserved: number; templates: NotificationTemplate[] }> {
    let created = 0;
    let preserved = 0;
    for (const event of Object.values(NotificationEvent)) {
      const result = await this.ensureSystemTemplate(event, actor.id);
      result.created ? created += 1 : preserved += 1;
    }
    await this.audit.record({
      userId: actor.id,
      module: 'notifications',
      action: 'CREAR_PLANTILLAS_BASE',
      entity: 'plantillas_notificacion',
      result: 'EXITOSO',
      metadata: { created, preserved, events: Object.values(NotificationEvent) },
    });
    return { created, preserved, templates: await this.listTemplates() };
  }

  async saveTemplate(dto: SaveNotificationTemplateDto, actor: AuthenticatedUser): Promise<NotificationTemplate> {
    const catalog = new Set<string>(AUTHORIZED_TEMPLATE_VARIABLES);
    const allowed = [...new Set(dto.allowedVariables)];
    if (allowed.some((variable) => !catalog.has(variable))) throw new BadRequestException('La plantilla contiene variables no autorizadas');
    const used = [...dto.body.matchAll(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g)].map((match) => match[1]);
    if (used.some((variable) => !allowed.includes(variable))) throw new BadRequestException('El cuerpo utiliza variables que no fueron autorizadas');
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(NotificationTemplate);
      if (dto.active) await repository.update({ event: dto.event, active: true }, { active: false });
      const template = await repository.save(repository.create({
        event: dto.event,
        reference: dto.reference.trim().toUpperCase(),
        version: dto.version,
        body: dto.body.trim(),
        allowedVariables: allowed,
        active: dto.active,
        createdById: actor.id,
      }));
      return template.id;
    });
    await this.audit.record({ userId: actor.id, module: 'notifications', action: 'CONFIGURAR_PLANTILLA', entity: 'plantillas_notificacion', entityId: id, result: 'EXITOSO', metadata: { event: dto.event, reference: dto.reference, version: dto.version, active: dto.active, allowedVariables: allowed } });
    return this.templates.findOneOrFail({ where: { id }, relations: { createdBy: true } });
  }

  async getChannel(): Promise<ChannelSettingView | null> {
    const channel = await this.channels.findOne({ where: { active: true }, relations: { updatedBy: true }, order: { updatedAt: 'DESC' } });
    return channel ? this.toChannelView(channel) : null;
  }

  async saveChannel(dto: SaveChannelSettingDto, actor: AuthenticatedUser): Promise<ChannelSettingView> {
    const previous = await this.activeChannelWithCredential();
    const receivedToken = dto.token?.trim() || null;
    if (!receivedToken && !previous?.encryptedToken) {
      throw new BadRequestException('Debe ingresar el token de LimiteAPI para configurar el canal');
    }
    const encryptedToken = receivedToken ? this.channelTokenCipher.encrypt(receivedToken) : previous!.encryptedToken;
    const tokenLast3 = receivedToken ? receivedToken.slice(-3) : previous!.tokenLast3;
    const id = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ChannelSetting);
      if (dto.active) await repository.update({ active: true }, { active: false });
      const channel = await repository.save(repository.create({
        provider: 'LIMITEAPI',
        apiUrl: dto.apiUrl,
        encryptedToken,
        tokenLast3,
        enabledNumber: dto.enabledNumber,
        licenseReference: dto.licenseReference?.trim() || null,
        timeoutMs: dto.timeoutMs,
        maxRetries: dto.maxRetries,
        retryDelaySeconds: dto.retryDelaySeconds,
        active: dto.active,
        updatedById: actor.id,
      }));
      return channel.id;
    });
    await this.audit.record({ userId: actor.id, module: 'notifications', action: 'CONFIGURAR_CANAL', entity: 'configuraciones_canal', entityId: id, result: 'EXITOSO', metadata: { provider: 'LIMITEAPI', apiUrl: dto.apiUrl, credentialChanged: Boolean(receivedToken), enabledNumber: dto.enabledNumber, licenseReference: dto.licenseReference ?? null, timeoutMs: dto.timeoutMs, maxRetries: dto.maxRetries, retryDelaySeconds: dto.retryDelaySeconds, active: dto.active } });
    const saved = await this.channels.findOneOrFail({ where: { id }, relations: { updatedBy: true } });
    return this.toChannelView(saved);
  }

  async listChannelTestLogs(query: PaginationQueryDto) {
    const [items, total] = await this.channelTestLogs.findAndCount({
      relations: { testedBy: true },
      order: { occurredAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return paginate(items, total, query.page, query.limit);
  }

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

  async enqueue(order: Order, link: TrackingLink | null, event: NotificationEvent, version: number, variables: TemplateVariables): Promise<Notification | null> {
    if (!await this.eventEnabled(event)) return null;
    const template = await this.templates.findOne({ where: { event, active: true }, order: { version: 'DESC' } });
    if (!template) return null;
    return this.enqueueWithTemplate(order, link, template, event, version, variables, `${order.id}:${event}:${version}`);
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

  private async enqueueWithTemplate(
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

  private render(template: NotificationTemplate, variables: TemplateVariables): string {
    let body = template.body;
    for (const variable of template.allowedVariables) {
      body = body.replace(new RegExp(`{{\\s*${variable}\\s*}}`, 'g'), variables[variable as keyof TemplateVariables] ?? '');
    }
    return body;
  }

  private renderLifecycleRequirements(
    body: string,
    template: NotificationTemplate,
    event: NotificationEvent,
    variables: TemplateVariables,
  ): string {
    const additions: string[] = [];
    if (
      [NotificationEvent.ORDER_DRAFT, NotificationEvent.ORDER_RECEIVED, NotificationEvent.ORDER_CONFIRMED].includes(event)
      && variables.productList
      && !template.allowedVariables.includes('productList')
    ) {
      additions.push(`${event === NotificationEvent.ORDER_CONFIRMED ? 'Productos confirmados' : 'Productos'}:\n${variables.productList}`);
    }
    if (
      event === NotificationEvent.ORDER_DRAFT
      && variables.confirmationUrl
      && !template.allowedVariables.includes('confirmationUrl')
    ) {
      additions.push(`Confirma tu pedido aquí: ${variables.confirmationUrl}`);
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

  private completeVariables(order: Order, variables: Partial<TemplateVariables>): TemplateVariables {
    return {
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

  private async lifecycleTemplate(
    event: NotificationEvent.ORDER_DRAFT | NotificationEvent.ORDER_RECEIVED | NotificationEvent.ORDER_CONFIRMED | NotificationEvent.ORDER_CANCELED,
    createdById: string,
  ): Promise<NotificationTemplate> {
    return (await this.ensureSystemTemplate(event, createdById)).template;
  }

  private async ensureSystemTemplate(event: NotificationEvent, createdById: string): Promise<{ template: NotificationTemplate; created: boolean }> {
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

  private normalizeRecipient(value: string): string | null {
    const normalized = value.replace(/\D/g, '');
    return /^\d{8,15}$/.test(normalized) ? normalized : null;
  }

  private activeChannelWithCredential(): Promise<ChannelSetting | null> {
    return this.channels.createQueryBuilder('channel')
      .addSelect('channel.encryptedToken')
      .leftJoinAndSelect('channel.updatedBy', 'updatedBy')
      .where('channel.active = true')
      .orderBy('channel.updatedAt', 'DESC')
      .getOne();
  }

  private toChannelView(channel: ChannelSetting): ChannelSettingView {
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

  private async saveChannelTestLog(input: {
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

  private maskRecipient(value: string): string {
    const normalized = value.replace(/\D/g, '');
    if (normalized.length <= 4) return '•'.repeat(normalized.length);
    return `${'•'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
  }

  private async finishFailure(item: Notification, status: number | null, response: Record<string, unknown>, error: string, recoverable: boolean, maxRetries: number, retryDelaySeconds = 60): Promise<void> {
    const attemptNumber = item.attempts.length + 1;
    const willRetry = recoverable && attemptNumber <= maxRetries;
    await this.attempts.save(this.attempts.create({ notificationId: item.id, attemptNumber, status: willRetry ? NotificationAttemptStatus.RECOVERABLE_FAILURE : NotificationAttemptStatus.DEFINITIVE_FAILURE, httpStatus: status, sanitizedResponse: response }));
    item.status = willRetry ? NotificationStatus.RETRY : NotificationStatus.FAILED;
    item.nextAttemptAt = new Date(Date.now() + retryDelaySeconds * 1000);
    item.processedAt = willRetry ? null : new Date();
    item.lastError = error.slice(0, 500);
    await this.notifications.save(item);
  }

  private assertWebhookAuthorization(value: string | undefined): void {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_TOKEN', '').trim();
    if (!expected) throw new ServiceUnavailableException('La validación del webhook no está configurada');
    const received = value?.startsWith('Bearer ') ? value.slice(7) : '';
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Webhook no autorizado');
  }
}
