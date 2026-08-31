import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds?: string[];

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
