import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { STRONG_PASSWORD } from '../../users/dto/create-user.dto';

export class CreateCustomerAccountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,80}$/)
  username: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsString()
  @Matches(STRONG_PASSWORD, {
    message:
      'La contraseña debe tener 10 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary = false;
}

export class UpdateCustomerAccountDto {
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
