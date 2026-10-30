import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  MinLength,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ProductionConsolidationStatus, ProductionConsolidationType } from '../entities/production.enums';

export class GenerateProductionConsolidationDto {
  @IsDateString()
  deliveryDate: string;

  @IsOptional()
  @IsUUID()
  stockRequestId?: string;
}

export class ScheduleProductionDetailDto {
  @IsDateString()
  scheduledDate: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  sequence: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999999)
  additionalQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ProductionReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class ProductionConsolidationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  code?: number;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsUUID()
  productionAreaId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsEnum(ProductionConsolidationType)
  type?: ProductionConsolidationType;

  @IsOptional()
  @IsEnum(ProductionConsolidationStatus)
  status?: ProductionConsolidationStatus;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean))
  @IsArray()
  @ArrayUnique()
  @IsEnum(ProductionConsolidationStatus, { each: true })
  statuses?: ProductionConsolidationStatus[];
}

export class RegisterProductionProgressDto {
  @IsUUID()
  consolidatedDetailId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class AdjustProductionPlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999999)
  plannedQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999999)
  additionalQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateProductionAreaDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}

export class UpdateProductionAreaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds?: string[];
}

export class RegisterProductionDeliveryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  quantity: number;

  @IsBoolean()
  finalDelivery: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  incident?: string;
}

export class ReceiveProductionDeliveryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  receivedQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}

export class CloseProductionConsolidationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
