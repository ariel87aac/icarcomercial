import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { STRONG_PASSWORD } from '../../users/dto/create-user.dto';

export class RequestRecoveryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  identifier: string;
}

export class ConfirmRecoveryDto {
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token: string;

  @IsString()
  @Matches(STRONG_PASSWORD, {
    message: 'La contraseña debe tener 10 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  newPassword: string;
}

