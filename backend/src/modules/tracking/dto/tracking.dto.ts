import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NotificationEvent, NotificationStatus } from '../entities/tracking.enums';

export class CreateTrackingLinkDto {
  @IsDateString()
  expiresAt: string;
}

export class TrackingEventDto {
  @IsUUID()
  orderId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(180)
  sourceEvent: string;
}

export class SaveEstimationSettingDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  averageStopMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  toleranceMinutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  nextDeliveryThreshold: number;
}

export class SaveNotificationTemplateDto {
  @IsEnum(NotificationEvent)
  event: NotificationEvent;

  @IsString()
  @Matches(/^[A-Z0-9_-]{2,80}$/)
  reference: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  allowedVariables: string[];

  @IsOptional()
  @IsBoolean()
  active = true;
}

export class SaveChannelSettingDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  apiUrl: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(1000)
  token?: string;

  @IsString()
  @Matches(/^\d{8,15}$/)
  enabledNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  licenseReference?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  retryDelaySeconds: number;

  @IsOptional()
  @IsBoolean()
  active = true;
}

export class NotificationQueryDto extends PaginationQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(NotificationEvent) event?: NotificationEvent;
  @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() orderId?: string;
}

export class WebhookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  eventId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  messageId: string;

  @IsString()
  @Matches(/^(SENT|DELIVERED|FAILED)$/)
  status: 'SENT' | 'DELIVERED' | 'FAILED';

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
