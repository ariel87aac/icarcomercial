import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { CustomerType } from '../../customers/entities/customer.enums';

export class CreateProductPriceDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialList?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  amount: number;

  @IsDateString({ strict: true })
  validFrom: string;

  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string;
}

export class UpdateProductPriceDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialList?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  amount?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  validFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  validUntil?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class PriceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  presentationId?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialList?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CatalogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productLineId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
