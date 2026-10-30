import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../compartido/dto/pagination-query.dto';
import { DistributionRouteStatus, VisitResultType, WarehouseReturnStatus } from '../entidades/distribution.enums';

export class DistributionRouteQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsEnum(DistributionRouteStatus)
  status?: DistributionRouteStatus;
}

export class PendingDistributionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

export class CreateDistributionRouteDto {
  @IsDateString()
  date: string;

  @IsUUID()
  zoneId: string;

  @IsUUID()
  vehicleId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  responsibleIds: string[];

  @IsUUID()
  principalResponsibleId: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  preparationIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class AddRouteDeliveriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  preparationIds: string[];
}

export class UpdateRouteVehicleDto {
  @IsUUID()
  vehicleId: string;
}

export class RouteSequenceItemDto {
  @IsUUID()
  routeDeliveryId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  position: number;
}

export class UpdateRouteSequenceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteSequenceItemDto)
  deliveries: RouteSequenceItemDto[];
}

export class RouteTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}

export class CancelRouteDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class RescheduleRouteDto {
  @IsDateString()
  date: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class WeightReadinessQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  missingOnly = true;
}

export class PresentationWeightItemDto {
  @IsUUID()
  presentationId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  weightKg: number;
}

export class UpdatePresentationWeightsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PresentationWeightItemDto)
  items: PresentationWeightItemDto[];
}

export class VisitResultDetailDto {
  @IsUUID()
  preparationDetailId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  deliveredQuantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  returnedQuantity: number;
}

export class RegisterVisitResultDto {
  @IsEnum(VisitResultType)
  result: VisitResultType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VisitResultDetailDto)
  details: VisitResultDetailDto[];
}

export class CompleteFactoryDeliveryDto extends RegisterVisitResultDto {
  @IsUUID()
  preparationId: string;
}

export class AcceptedReturnDto {
  @IsUUID()
  visitDetailId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity: number;
}

export class SettleRouteDto extends RouteTransitionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptedReturnDto)
  acceptedReturns: AcceptedReturnDto[];
}

export class WarehouseReturnQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WarehouseReturnStatus)
  status?: WarehouseReturnStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReceiveWarehouseReturnItemDto {
  @IsUUID()
  detailId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity: number;
}

export class ReceiveWarehouseReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveWarehouseReturnItemDto)
  details: ReceiveWarehouseReturnItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
