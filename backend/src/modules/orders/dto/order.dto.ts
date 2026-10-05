import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OrderStatus } from '../entities/order.enums';

export class OrderItemDto {
  @IsUUID()
  presentationId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(99999999999)
  quantity: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  addressId: string;

  @IsDateString({ strict: true })
  requestedDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  details: OrderItemDto[];
}

export class UpdateOrderDto {
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  requestedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  details?: OrderItemDto[];
}

export class ReturnOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  observation: string;
}

export class TransitionOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class OrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
