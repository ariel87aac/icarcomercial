import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class CreateNamedCatalogItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

export class UpdateNamedCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CreateUnitMeasureDto extends CreateNamedCatalogItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  abbreviation: string;
}

export class UpdateUnitMeasureDto extends UpdateNamedCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  abbreviation?: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsUUID()
  productLineId: string;

  @IsUUID()
  baseUnitId: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productLineId?: string;

  @IsOptional()
  @IsUUID()
  baseUnitId?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CreateProductPresentationDto {
  @IsUUID()
  unitId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999)
  conversionFactor: number;
}

export class UpdateProductPresentationDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999)
  conversionFactor?: number;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class ProductQueryDto extends PaginationQueryDto {
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
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
