import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
