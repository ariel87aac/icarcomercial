import { IcarReportColumn, IcarReportGroup, IcarReportOptions } from '../../../compartido/reportes/icar-report.types';
import { ProductionConsolidationStatus } from '../dominio/production.enums';
import { ProductionPlanningReportMode } from './production-report.dto';

export interface ProductionPlanningRawRow {
  orderId: string;
  orderCode: number;
  orderStatus: ProductionConsolidationStatus;
  deliveryDate: string | Date;
  scheduledDate: string | Date;
  sequence: number;
  productId: string;
  presentationId: string | null;
  baseUnitId: string;
  productCode: string | number;
  productName: string;
  presentationDescription: string | null;
  categoryName: string | null;
  areaId: string | null;
  areaName: string | null;
  unitAbbreviation: string;
  plannedQuantity: string;
}

interface PlanningReportContext {
  rows: ProductionPlanningRawRow[];
  mode: ProductionPlanningReportMode;
  generatedBy: string;
  generatedAt: Date;
  logoPath: string;
}

interface TotalRow {
  code: string;
  product: string;
  presentation: string;
  categories: Set<string>;
  areas: Set<string>;
  quantity: number;
  unit: string;
}

export function buildProductionPlanningReport(context: PlanningReportContext): IcarReportOptions {
  const order = context.rows[0];
  const totalGroups = buildTotalGroups(context.rows);
  const areaGroups = buildAreaGroups(context.rows);
  const areaNames = new Set(context.rows.map((row) => row.areaName ?? 'Sin área asignada'));
  const columns = context.mode === ProductionPlanningReportMode.TOTAL ? totalColumns() : areaColumns();
  const groups = context.mode === ProductionPlanningReportMode.TOTAL ? totalGroups : areaGroups;
  return {
    title:
      context.mode === ProductionPlanningReportMode.TOTAL
        ? `Planificación OP-${order.orderCode} - Total de productos`
        : `Planificación OP-${order.orderCode} - Orden por área`,
    code: context.mode === ProductionPlanningReportMode.TOTAL ? 'PROD-PLAN-TOTAL' : 'PROD-PLAN-AREAS',
    pageBreakBetweenGroups: context.mode === ProductionPlanningReportMode.AREAS,
    periodLabel: `Entrega ${longDateOnly(order.deliveryDate)}`,
    contextLabel: 'Orden',
    filterLabel: `OP-${order.orderCode} · ${STATUS_LABELS[order.orderStatus]}`,
    groupLabel: context.mode === ProductionPlanningReportMode.TOTAL ? 'Resumen' : 'Área',
    emptyMessage: 'No existen productos planificados para los estados seleccionados.',
    generatedBy: context.generatedBy,
    generatedAt: context.generatedAt,
    logoPath: context.logoPath,
    columns,
    metrics: [
      { label: 'Orden de producción', value: `OP-${order.orderCode}` },
      { label: 'Productos planificados', value: totalGroups[0]?.rows.length ?? 0 },
      { label: 'Áreas involucradas', value: areaNames.size },
    ],
    groups,
  };
}

function buildTotalGroups(rows: ProductionPlanningRawRow[]): IcarReportGroup[] {
  if (!rows.length) return [];
  const totals = new Map<string, TotalRow>();
  for (const row of rows) {
    const key = `${row.productId}:${row.presentationId ?? 'none'}:${row.baseUnitId}`;
    const total = totals.get(key) ?? {
      code: String(row.productCode),
      product: row.productName,
      presentation: row.presentationDescription ?? 'Sin presentación',
      categories: new Set<string>(),
      areas: new Set<string>(),
      quantity: 0,
      unit: row.unitAbbreviation,
    };
    total.categories.add(row.categoryName ?? 'Sin categoría');
    total.areas.add(row.areaName ?? 'Sin área asignada');
    total.quantity = roundQuantity(total.quantity + Number(row.plannedQuantity));
    totals.set(key, total);
  }
  const items = [...totals.values()].sort((left, right) =>
    left.code.localeCompare(right.code, 'es', { numeric: true }) || left.product.localeCompare(right.product, 'es'),
  );
  return [{
    title: 'Productos consolidados',
    rows: items.map((item) => ({ values: {
      code: item.code,
      product: item.product,
      presentation: item.presentation,
      category: [...item.categories].sort().join(', '),
      area: [...item.areas].sort().join(', '),
      quantity: item.quantity,
      unit: item.unit,
    } })),
  }];
}

function buildAreaGroups(rows: ProductionPlanningRawRow[]): IcarReportGroup[] {
  const groups = new Map<string, ProductionPlanningRawRow[]>();
  for (const row of rows) {
    const name = row.areaName ?? 'Sin área asignada';
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'es'))
    .map(([area, groupRows]) => ({
      title: area,
      rows: groupRows
        .sort((left, right) =>
          dateKey(left.scheduledDate).localeCompare(dateKey(right.scheduledDate)) ||
          left.sequence - right.sequence ||
          right.orderCode - left.orderCode ||
          String(left.productCode).localeCompare(String(right.productCode), 'es', { numeric: true }),
        )
        .map((row) => ({ values: {
          order: row.orderCode,
          date: shortDate(row.scheduledDate),
          sequence: row.sequence,
          code: String(row.productCode),
          product: row.productName,
          presentation: row.presentationDescription ?? 'Sin presentación',
          category: row.categoryName ?? 'Sin categoría',
          quantity: numericQuantity(row.plannedQuantity),
          unit: row.unitAbbreviation,
        } })),
    }));
}

function totalColumns(): IcarReportColumn[] {
  return [
    { key: 'code', label: 'Código', width: 52, align: 'center' },
    { key: 'product', label: 'Producto', width: 150 },
    { key: 'presentation', label: 'Presentación', width: 135 },
    { key: 'category', label: 'Categoría', width: 105 },
    { key: 'area', label: 'Área', width: 105 },
    { key: 'quantity', label: 'Total planificado', width: 90, align: 'right' },
    { key: 'unit', label: 'Unidad', width: 58, align: 'center' },
  ];
}

function areaColumns(): IcarReportColumn[] {
  return [
    { key: 'order', label: 'Orden', width: 48, align: 'center' },
    { key: 'date', label: 'Programada', width: 64, align: 'center' },
    { key: 'sequence', label: 'Sec.', width: 38, align: 'center' },
    { key: 'code', label: 'Código', width: 48, align: 'center' },
    { key: 'product', label: 'Producto', width: 130 },
    { key: 'presentation', label: 'Presentación', width: 130 },
    { key: 'category', label: 'Categoría', width: 90 },
    { key: 'quantity', label: 'Planificado', width: 72, align: 'right' },
    { key: 'unit', label: 'Unidad', width: 52, align: 'center' },
  ];
}

const STATUS_LABELS: Record<ProductionConsolidationStatus, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  EN_PROCESO: 'En proceso',
  CERRADA: 'Completada',
  CANCELADA: 'Cancelada',
  CERRADA_INCOMPLETA: 'Completada con faltantes',
};

function numericQuantity(value: string): number { return roundQuantity(Number(value)); }
function roundQuantity(value: number): number { return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000; }
function shortDate(value: string | Date): string {
  const [year, month, day] = dateKey(value).split('-');
  return `${day}/${month}/${year}`;
}
function longDateOnly(value: string | Date): string {
  return new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(new Date(`${dateKey(value)}T12:00:00`));
}
function dateKey(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, '0'), String(value.getUTCDate()).padStart(2, '0')].join('-');
}
