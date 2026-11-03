import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../compartido/dto/pagination-query.dto';
import { VehicleDispatchStatus } from '../entidades/distribution.enums';

export class VehicleDispatchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(VehicleDispatchStatus)
  status?: VehicleDispatchStatus;
}

export class ActiveVehicleDispatchQueryDto {
  @IsOptional()
  @IsUUID()
  zoneId?: string;
}

export class CreateVehicleDispatchDto {
  @IsUUID()
  vehicleId: string;

  @IsUUID()
  responsibleId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  zoneIds: string[];
}

export class UpdateVehicleDispatchZonesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  zoneIds: string[];
}

export class HandoverVehicleDispatchDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  initialOdometer: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}

export class ReturnVehicleDispatchDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  finalOdometer: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
