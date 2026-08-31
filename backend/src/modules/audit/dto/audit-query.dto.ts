import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

