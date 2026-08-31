import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { CustomerType } from '../entities/customer.enums';

export class CustomerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number;
}

