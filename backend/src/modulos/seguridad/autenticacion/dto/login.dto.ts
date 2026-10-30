import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  identifier: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password: string;
}

