import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class CreateZoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class CreateDistributionDayDto {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}

export class UpdateDistributionDayDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

