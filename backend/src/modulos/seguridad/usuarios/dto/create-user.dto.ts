import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{4,80}$/, {
    message: 'El nombre de usuario debe tener al menos 4 caracteres y solo puede usar letras, números, punto, guion o guion bajo',
  })
  username: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productionAreaIds?: string[];
}
