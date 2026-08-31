import { IsString, Matches, MaxLength } from 'class-validator';
import { STRONG_PASSWORD } from '../../users/dto/create-user.dto';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(100)
  currentPassword: string;

  @IsString()
  @Matches(STRONG_PASSWORD, {
    message: 'La contraseña debe tener 10 caracteres e incluir mayúscula, minúscula, número y símbolo',
  })
  newPassword: string;
}

