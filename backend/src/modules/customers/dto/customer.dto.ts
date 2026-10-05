import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { CustomerType, PaymentCondition } from '../entities/customer.enums';

export class CreateCustomerDto {
  @IsEnum(CustomerType)
  type: CustomerType;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  businessName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsEnum(PaymentCondition)
  paymentCondition: PaymentCondition;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialList?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  creditLimit = 0;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  creditDays = 0;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  commercialList?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  creditLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  creditDays?: number;

  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
