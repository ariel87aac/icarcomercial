import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import {
  InventoryMovementType,
  InventoryReservationStatus,
  StockReplenishmentRequestStatus,
} from '../entities/inventory.enums';

export class CreateInventoryMovementDto {
  @IsUUID()
  presentationId: string;

  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(99999999999)
  quantity: number;

  @IsString()
  @MaxLength(255)
  reason: string;
}

export class StockQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  productLineId?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyWithStock?: boolean;
}

export class InventoryMovementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  stockId?: string;

  @IsOptional()
  @IsUUID()
  presentationId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;
}

export class InventoryReservationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  presentationId?: string;

  @IsOptional()
  @IsEnum(InventoryReservationStatus)
  status?: InventoryReservationStatus;
}

export class CreateStockReplenishmentRequestDto {
  @IsDateString()
  requiredDate: string;
}

export class StockReplenishmentRequestQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  requiredDate?: string;

  @IsOptional()
  @IsEnum(StockReplenishmentRequestStatus)
  status?: StockReplenishmentRequestStatus;
}

export class StockReplenishmentPlanQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class SaveStockReplenishmentRequestItemDto {
  @IsUUID()
  presentationId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999999)
  additionalStockQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class SaveStockReplenishmentRequestDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveStockReplenishmentRequestItemDto)
  items: SaveStockReplenishmentRequestItemDto[];
}
