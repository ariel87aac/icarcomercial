import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,80}$/)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}

