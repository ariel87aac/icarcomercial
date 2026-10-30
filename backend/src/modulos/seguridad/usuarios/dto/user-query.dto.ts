import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../../../compartido/enumeraciones/record-status.enum';

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

