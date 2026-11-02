export interface IcarReportCellValue {
  display: string;
  excel: string | number | Date | null;
}

export type IcarReportValue = string | number | Date | IcarReportCellValue | null;

export interface IcarReportColumn {
  key: string;
  label: string;
  width: number;
  excelWidth?: number;
  excelNumberFormat?: string;
  align?: 'left' | 'center' | 'right';
}

export interface IcarReportRow {
  values: Record<string, IcarReportValue>;
}

export interface IcarReportGroup {
  title: string;
  rows: IcarReportRow[];
}

export interface IcarReportMetric {
  label: string;
  value: string | number;
}

export interface IcarReportOptions {
  title: string;
  code: string;
  pdfLayout?: 'portrait' | 'landscape';
  worksheetName?: string;
  periodLabel: string;
  contextLabel?: string;
  filterLabel: string;
  groupLabel?: string;
  emptyMessage?: string;
  footerLabel?: string;
  generatedBy: string;
  generatedAt: Date;
  logoPath: string;
  columns: IcarReportColumn[];
  metrics: IcarReportMetric[];
  groups: IcarReportGroup[];
}
