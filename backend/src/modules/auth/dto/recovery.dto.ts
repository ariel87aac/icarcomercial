import { IsString, MaxLength, MinLength } from 'class-validator';

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
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  newPassword: string;
}

