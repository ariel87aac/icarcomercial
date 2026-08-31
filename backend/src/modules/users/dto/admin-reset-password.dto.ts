import { IsString, Matches } from 'class-validator';
import { STRONG_PASSWORD } from './create-user.dto';

export class AdminResetPasswordDto {
  @IsString()
  @Matches(STRONG_PASSWORD, {
    message: 'La contraseña debe tener 10 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  newPassword: string;
}

