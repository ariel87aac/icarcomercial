import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { InventoryMovementType, InventoryReservationStatus } from '../entities/inventory.enums';

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
  @IsEnum(RecordStatus)
  status?: RecordStatus;
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
