import { BadRequestException } from '@nestjs/common';
import { paginate, PaginationQueryDto } from '../../compartido/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import {
  SaveChannelSettingDto,
  SaveEstimationSettingDto,
  SaveNotificationTemplateDto,
} from './dto/tracking.dto';
import { ChannelSetting } from './entidades/channel-setting.entity';
import { EstimationSetting } from './entidades/estimation-setting.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { Notification } from './entidades/notification.entity';
import { NotificationEvent, NotificationStatus } from './entidades/tracking.enums';
import { In } from 'typeorm';
import { NotificationServiceParte02 } from './notification.02-testChannel';

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

export abstract class NotificationServiceParte01 extends NotificationServiceParte02 {
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

  async eventEnabled(event: NotificationEvent): Promise<boolean> {
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
      const [channel] = await this.channels.find({ relations: { updatedBy: true }, order: { updatedAt: 'DESC' }, take: 1 });
      return channel ? this.toChannelView(channel) : null;
    }

  async saveChannel(dto: SaveChannelSettingDto, actor: AuthenticatedUser): Promise<ChannelSettingView> {
      const previous = await this.latestChannelWithCredential();
      const receivedToken = dto.token?.trim() || null;
      if (!receivedToken && !previous?.encryptedToken) {
        throw new BadRequestException('Debe ingresar el token de LimiteAPI para configurar el canal');
      }
      const encryptedToken = receivedToken ? this.channelTokenCipher.encrypt(receivedToken) : previous!.encryptedToken;
      const tokenLast3 = receivedToken ? receivedToken.slice(-3) : previous!.tokenLast3;
      const id = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(ChannelSetting);
        await repository.update({ active: true }, { active: false });
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

  async setChannelActive(active: boolean, actor: AuthenticatedUser): Promise<ChannelSettingView> {
      const [current] = await this.channels.find({ order: { updatedAt: 'DESC' }, take: 1 });
      if (!current) throw new BadRequestException('Primero configure el canal de WhatsApp');
      const omitted = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(ChannelSetting);
        await repository.update({ active: true }, { active: false });
        await repository.update(current.id, { active, updatedById: actor.id });
        if (active) return 0;
        const result = await manager.getRepository(Notification).update(
          { status: In([NotificationStatus.PENDING, NotificationStatus.RETRY]) },
          {
            status: NotificationStatus.FAILED,
            processedAt: new Date(),
            lastError: 'Envío omitido porque el canal fue deshabilitado',
          },
        );
        return result.affected ?? 0;
      });
      await this.audit.record({
        userId: actor.id,
        module: 'notifications',
        action: active ? 'HABILITAR_CANAL' : 'DESHABILITAR_CANAL',
        entity: 'configuraciones_canal',
        entityId: current.id,
        result: 'EXITOSO',
        metadata: { active, omitted },
      });
      const saved = await this.channels.findOneOrFail({ where: { id: current.id }, relations: { updatedBy: true } });
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
}
