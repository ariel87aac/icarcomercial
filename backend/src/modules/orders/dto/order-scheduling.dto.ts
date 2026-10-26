import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class DeliveryOptionsQueryDto {
  @IsUUID()
  addressId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class UpdateOrderSchedulingDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  orderCutoffTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  orderCutoffLeadDays: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  consolidationDeadlineTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  preparationLeadDays: number;
}
