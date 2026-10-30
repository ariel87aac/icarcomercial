import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';
import { CustomerType } from '../../../clientes/entidades/customer.enums';

export class CreateProductPriceDto {
  @IsEnum(CustomerType)
  customerType: CustomerType;

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
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class PriceMatrixQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 500;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}

export class BulkPriceItemDto {
  @IsUUID()
  presentationId: string;

  @IsEnum(CustomerType)
  customerType: CustomerType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  amount: number;
}

export class BulkUpdatePricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkPriceItemDto)
  items: BulkPriceItemDto[];
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
