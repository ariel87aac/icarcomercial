import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum ProductionReportFormat {
  PDF = 'PDF',
  XLSX = 'XLSX',
}

export class ProductionDailyReportQueryDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim())
    .filter(Boolean))
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productionAreaIds?: string[];
}

export class ProductionDailyReportExportQueryDto extends ProductionDailyReportQueryDto {
  @IsEnum(ProductionReportFormat)
  format: ProductionReportFormat;
}
