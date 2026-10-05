import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DistributionRouteStatus, VisitResultType } from '../entities/distribution.enums';

export class DistributionRouteQueryDto extends PaginationQueryDto {
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
