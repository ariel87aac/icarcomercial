import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label = 'Principal';

  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  distributionDayId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary = false;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  distributionDayId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

