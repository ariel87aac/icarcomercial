import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class UserQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsUUID()
  roleId?: string;
}

