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
import { paginate } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { sanitizeSecrets } from '../../common/utils/secret-sanitizer.util';
import { AuditService } from '../audit/audit.service';
import { Order } from '../orders/entities/order.entity';
import { SaveChannelSettingDto, NotificationQueryDto, SaveEstimationSettingDto, SaveNotificationTemplateDto, WebhookDto } from './dto/tracking.dto';
import { ChannelSetting } from './entities/channel-setting.entity';
import { EstimationSetting } from './entities/estimation-setting.entity';
import { NotificationAttempt } from './entities/notification-attempt.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationWebhook } from './entities/notification-webhook.entity';
import { Notification } from './entities/notification.entity';
import { NotificationAttemptStatus, NotificationEvent, NotificationStatus } from './entities/tracking.enums';
import { TrackingLink } from './entities/tracking-link.entity';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { LimiteApiAdapter } from './limite-api.adapter';

export const AUTHORIZED_TEMPLATE_VARIABLES = [
  'orderReference',
  'publicStatus',
  'pendingStops',
  'estimatedFrom',
  'estimatedUntil',
  'customerName',
] as const;

type TemplateVariables = Record<(typeof AUTHORIZED_TEMPLATE_VARIABLES)[number], string>;

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

  async listTemplates(): Promise<NotificationTemplate[]> {
    return this.templates.find({ relations: { createdBy: true }, order: { event: 'ASC', version: 'DESC' } });
  }

  async saveTemplate(dto: SaveNotificationTemplateDto, actor: AuthenticatedUser): Promise<NotificationTemplate> {
    if (dto.event === NotificationEvent.PAYMENT_RECEIVED) {
      throw new BadRequestException('PAGO_RECIBIDO queda reservado para la sexta iteración y no puede activarse');
    }
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

  async enqueue(order: Order, link: TrackingLink, event: NotificationEvent, version: number, variables: TemplateVariables): Promise<Notification | null> {
    if (event === NotificationEvent.PAYMENT_RECEIVED) return null;
    const template = await this.templates.findOne({ where: { event, active: true }, order: { version: 'DESC' } });
    if (!template) return null;
    const recipient = this.normalizeRecipient(order.customer.whatsapp || order.customer.phone);
    if (!recipient) return null;
    const key = event === NotificationEvent.NEXT_DELIVERY
      ? `${order.id}:${event}:threshold`
      : `${order.id}:${event}:${version}`;
    const existing = await this.notifications.findOne({ where: { idempotencyKey: key } });
    if (existing) return existing;
    const renderedBody = this.render(template, variables);
    try {
      return await this.notifications.save(this.notifications.create({
        orderId: order.id,
        customerId: order.customerId,
        linkId: link.id,
        templateId: template.id,
        resentFromId: null,
        recipient,
        event,
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
