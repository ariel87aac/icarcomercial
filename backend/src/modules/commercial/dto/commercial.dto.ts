import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { CommercialReportType, PaymentApplicationMode, PaymentStatus, ReportFormat, SaleStatus } from '../entities/commercial.enums';

export class CreateSaleDto {
  @IsUUID()
  visitResultId: string;
}

export class SaleQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsEnum(SaleStatus) status?: SaleStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
}

export class VoidCommercialOperationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class PaymentApplicationDto {
  @IsUUID()
  saleId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class CreatePaymentDto {
  @IsUUID()
  customerId: string;

  @IsUUID()
  paymentMethodId: string;

  @IsDateString()
  paymentDate: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentApplicationMode)
  applicationMode: PaymentApplicationMode = PaymentApplicationMode.SELECTED;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;

  @ValidateIf((dto: CreatePaymentDto) => dto.applicationMode === PaymentApplicationMode.SELECTED)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentApplicationDto)
  applications?: PaymentApplicationDto[];
}

export class PaymentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class AccountQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ReceivableQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsDateString() cutoffDate?: string;
  @IsOptional() @IsIn(['VIGENTE', 'VENCIDA', 'SALDADA']) status?: 'VIGENTE' | 'VENCIDA' | 'SALDADA';
  @IsOptional() @IsIn(['VIGENTE', '1_30', '31_60', '61_90', 'MAS_90']) agingRange?: 'VIGENTE' | '1_30' | '31_60' | '61_90' | 'MAS_90';
}

export class CommercialReportQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsDateString() cutoffDate?: string;
  @IsOptional() @IsEnum(SaleStatus) saleStatus?: SaleStatus;
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;
}

export class CommercialExportQueryDto extends CommercialReportQueryDto {
  @IsEnum(ReportFormat)
  format: ReportFormat;
}

export class CreatePaymentMethodDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsBoolean()
  requiresReference: boolean;

  @IsOptional()
  @IsEnum(RecordStatus)
  status = RecordStatus.ACTIVE;
}

export class UpdatePaymentMethodDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() requiresReference?: boolean;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class SaveVoucherSeriesDto {
  @IsString()
  @Matches(/^[A-Z0-9-]{1,20}$/)
  series: string;

  @IsOptional()
  @IsEnum(RecordStatus)
  status = RecordStatus.ACTIVE;
}

export { CommercialReportType };
