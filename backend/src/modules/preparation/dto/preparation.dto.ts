import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PreparationStatus } from '../entities/preparation.enums';

export class PreparationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(PreparationStatus)
  status?: PreparationStatus;
}

export class CreatePreparationDto {
  @IsUUID()
  orderId: string;
}

export class PreparationProgressItemDto {
  @IsUUID()
  preparationDetailId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  preparedQuantity: number;

  @IsBoolean()
  verified: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class RegisterPreparationProgressDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreparationProgressItemDto)
  details: PreparationProgressItemDto[];
}

export class ConfirmPreparationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
