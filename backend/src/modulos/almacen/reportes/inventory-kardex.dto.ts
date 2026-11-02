import { IsDateString, IsEnum, IsUUID } from 'class-validator';

export enum InventoryKardexFormat {
  PDF = 'PDF',
  XLSX = 'XLSX',
}

export class InventoryKardexQueryDto {
  @IsUUID()
  presentationId: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class InventoryKardexExportQueryDto extends InventoryKardexQueryDto {
  @IsEnum(InventoryKardexFormat)
  format: InventoryKardexFormat;
}
