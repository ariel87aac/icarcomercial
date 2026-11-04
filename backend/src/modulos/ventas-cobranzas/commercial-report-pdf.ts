import { join } from 'node:path';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { createIcarPdfReport } from '../../compartido/reportes/icar-pdf-report';
import { IcarReportColumn, IcarReportMetric, IcarReportOptions, IcarReportValue } from '../../compartido/reportes/icar-report.types';
import { CommercialReportQueryDto } from './dto/commercial.dto';
import { CommercialReportType } from './entidades/commercial.enums';

type ReportRow = Record<string, unknown>;
type PdfRow = Record<string, IcarReportValue>;

interface PdfDefinition {
  title: string;
  code: string;
  columns: IcarReportColumn[];
  row: (source: ReportRow) => PdfRow;
}

const DEFINITIONS: Record<CommercialReportType, PdfDefinition> = {
  [CommercialReportType.SALES]: {
    title: 'Reporte de ventas', code: 'COM-VENTAS',
    columns: [
      { key: 'sale', label: 'Cod-Venta', width: 54 },
      { key: 'order', label: 'Cod-Pedido', width: 68 },
      { key: 'customer', label: 'Cliente', width: 150 },
      { key: 'issued', label: 'Emisión', width: 66 },
      { key: 'due', label: 'Vencimiento', width: 66 },
      { key: 'total', label: 'Total', width: 70, align: 'right' },
      { key: 'status', label: 'Estado', width: 74 },
    ],
    row: (item) => ({ sale: text(item.codVenta), order: text(item.codPedido), customer: text(item.cliente),
      issued: date(item.fechaEmision), due: date(item.fechaVencimiento), total: money(item.total), status: label(item.estado) }),
  },
  [CommercialReportType.PAYMENTS]: {
    title: 'Reporte de cobros', code: 'COM-COBROS',
    columns: [
      { key: 'payment', label: 'Cod-Cobro', width: 45 },
      { key: 'customer', label: 'Cliente', width: 105 },
      { key: 'date', label: 'Fecha', width: 55 },
      { key: 'method', label: 'Medio', width: 65 },
      { key: 'reference', label: 'Referencia', width: 70 },
      { key: 'observation', label: 'Observación', width: 85 },
      { key: 'status', label: 'Estado', width: 55 },
      { key: 'amount', label: 'Importe', width: 68, align: 'right' },
    ],
    row: (item) => ({ payment: text(item.codCobro), customer: text(item.cliente), date: date(item.fecha), method: text(item.medio),
      reference: text(item.referencia) || '—', observation: text(item.observacion) || '—', status: label(item.estado), amount: money(item.importe) }),
  },
  [CommercialReportType.RECEIVABLES]: {
    title: 'Reporte de cuentas por cobrar', code: 'COM-CARTERA',
    columns: [
      { key: 'sale', label: 'Cod-Venta', width: 55 },
      { key: 'customer', label: 'Cliente', width: 143 },
      { key: 'due', label: 'Vencimiento', width: 65 },
      { key: 'status', label: 'Estado', width: 60 },
      { key: 'days', label: 'Días mora', width: 50, align: 'right' },
      { key: 'aging', label: 'Antigüedad', width: 85 },
      { key: 'balance', label: 'Saldo', width: 90, align: 'right' },
    ],
    row: (item) => ({ sale: text(item.codVenta), customer: text(item.cliente), due: date(item.vencimiento),
      status: label(item.estado), days: text(item.diasMora), aging: label(item.antiguedad), balance: money(item.saldo) }),
  },
  [CommercialReportType.TRACEABILITY]: {
    title: 'Reporte de trazabilidad comercial', code: 'COM-TRAZA',
    columns: [
      { key: 'sale', label: 'Cod-Venta', width: 50 },
      { key: 'order', label: 'Cod-Pedido', width: 65 },
      { key: 'customer', label: 'Cliente', width: 128 },
      { key: 'status', label: 'Estado', width: 68 },
      { key: 'total', label: 'Total', width: 70, align: 'right' },
      { key: 'balance', label: 'Saldo', width: 70, align: 'right' },
      { key: 'voucher', label: 'Comprobante', width: 97 },
    ],
    row: (item) => ({ sale: text(item.saleCode), order: text(item.orderCode), customer: text(item.customer), status: label(item.saleStatus),
      total: money(item.total), balance: money(item.balance), voucher: text(item.voucher) || 'Sin comprobante' }),
  },
};

export function createCommercialPdfReport(
  type: CommercialReportType,
  rows: ReportRow[],
  report: { totals?: Record<string, unknown> },
  query: CommercialReportQueryDto,
  actor: AuthenticatedUser,
): Promise<Buffer> {
  const definition = DEFINITIONS[type];
  const options: IcarReportOptions = {
    title: definition.title,
    code: definition.code,
    pdfLayout: 'portrait',
    periodLabel: period(query),
    contextLabel: 'Alcance',
    filterLabel: filters(query),
    groupLabel: 'RESULTADOS',
    emptyMessage: 'No existen resultados para los filtros seleccionados.',
    generatedBy: actor.name,
    generatedAt: new Date(),
    logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    columns: definition.columns,
    metrics: metrics(type, rows, report.totals),
    groups: rows.length ? [{ title: `${rows.length} registro(s)`, rows: rows.map((item) => ({ values: definition.row(item) })) }] : [],
  };
  return createIcarPdfReport(options);
}

function metrics(type: CommercialReportType, rows: ReportRow[], totals?: Record<string, unknown>): IcarReportMetric[] {
  const result: IcarReportMetric[] = [{ label: 'Registros', value: rows.length }];
  if (totals?.total != null) result.push({ label: type === CommercialReportType.PAYMENTS ? 'Cobrado' : 'Total', value: money(totals.total) });
  if (totals?.balance != null) result.push({ label: 'Saldo', value: money(totals.balance) });
  return result;
}

function period(query: CommercialReportQueryDto): string {
  if (query.from || query.to) return `Desde ${date(query.from) || 'inicio'} hasta ${date(query.to) || 'hoy'}`;
  if (query.cutoffDate) return `Corte al ${date(query.cutoffDate)}`;
  return 'Histórico completo';
}

function filters(query: CommercialReportQueryDto): string {
  const values = [query.customerId ? 'Cliente seleccionado' : 'Todos los clientes', query.zoneId ? 'Zona seleccionada' : null,
    query.saleStatus ? `Venta: ${label(query.saleStatus)}` : null, query.paymentStatus ? `Cobro: ${label(query.paymentStatus)}` : null];
  return values.filter(Boolean).join(' · ');
}

function date(value: unknown): string {
  const text = String(value ?? '').slice(0, 10);
  const [year, month, day] = text.split('-');
  return day && month && year ? `${day}/${month}/${year}` : text;
}

function money(value: unknown): string { return `Bs ${Number(value ?? 0).toFixed(2)}`; }
function label(value: unknown): string { return String(value ?? '').replaceAll('_', ' '); }
function text(value: unknown): string { return String(value ?? ''); }
