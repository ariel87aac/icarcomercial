import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { ChannelSetting } from './entidades/channel-setting.entity';
import { ChannelTestLog } from './entidades/channel-test-log.entity';
import { EstimationSetting } from './entidades/estimation-setting.entity';
import { NotificationAttempt } from './entidades/notification-attempt.entity';
import { NotificationTemplate } from './entidades/notification-template.entity';
import { NotificationWebhook } from './entidades/notification-webhook.entity';
import { Notification } from './entidades/notification.entity';
import { ChannelTokenCipherService } from './channel-token-cipher.service';
import { LimiteApiAdapter } from './limite-api.adapter';

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
export abstract class NotificationServiceBase {
  [nombre: string]: any;

  constructor(
        @InjectRepository(Notification) protected readonly notifications: Repository<Notification>,
        @InjectRepository(NotificationTemplate) protected readonly templates: Repository<NotificationTemplate>,
        @InjectRepository(EstimationSetting) protected readonly settings: Repository<EstimationSetting>,
        @InjectRepository(ChannelSetting) protected readonly channels: Repository<ChannelSetting>,
        @InjectRepository(ChannelTestLog) protected readonly channelTestLogs: Repository<ChannelTestLog>,
        @InjectRepository(NotificationAttempt) protected readonly attempts: Repository<NotificationAttempt>,
        @InjectRepository(NotificationWebhook) protected readonly webhooks: Repository<NotificationWebhook>,
        protected readonly dataSource: DataSource,
        protected readonly audit: AuditService,
        protected readonly provider: LimiteApiAdapter,
        protected readonly channelTokenCipher: ChannelTokenCipherService,
        protected readonly config: ConfigService,
      ) {}
}
