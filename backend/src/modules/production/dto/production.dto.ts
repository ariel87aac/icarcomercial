import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ProductionConsolidationStatus, ProductionConsolidationType } from '../entities/production.enums';

export class GenerateProductionConsolidationDto {
  @IsDateString()
  deliveryDate: string;

  @IsOptional()
  @IsUUID()
  productLineId?: string;
}

export class ProductionConsolidationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsUUID()
  productLineId?: string;

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

export class CloseProductionConsolidationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
