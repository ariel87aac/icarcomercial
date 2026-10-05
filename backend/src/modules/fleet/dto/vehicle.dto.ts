import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class VehicleQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CreateVehicleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  plate: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  description: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  referenceCapacity?: number;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  plate?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  referenceCapacity?: number;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
