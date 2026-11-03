import { IcarReportColumn, IcarReportOptions } from '../../../compartido/reportes/icar-report.types';
import { Vehicle } from '../flota/entidades/vehicle.entity';
import { VehicleDispatch } from '../entidades/vehicle-dispatch.entity';
import { VehicleDispatchStatus } from '../entidades/distribution.enums';

interface VehicleDispatchReportContext {
  vehicle: Vehicle;
  dispatches: VehicleDispatch[];
  generatedBy: string;
  generatedAt: Date;
  logoPath: string;
}

export function buildVehicleDispatchReport(context: VehicleDispatchReportContext): IcarReportOptions {
  const ordered = [...context.dispatches].sort((left, right) => left.code - right.code);
  const used = ordered.filter((item) => item.handedOverAt && item.initialOdometer !== null);
  const returned = used.filter((item) => item.returnedAt && item.finalOdometer !== null);
  const first = used[0];
  const last = returned.at(-1);
  const totalDistance = returned.reduce((sum, item) => sum + distance(item), 0);
  const totalUsage = used.reduce((sum, item) => sum + usageMilliseconds(item, context.generatedAt), 0);
  return {
    title: `Reporte histórico del vehículo ${context.vehicle.plate}`,
    code: 'DIST-VEHICULO',
    pdfLayout: 'portrait',
    maxPdfRowHeight: 84,
    periodLabel: reportPeriod(used, context.generatedAt),
    contextLabel: 'Vehículo',
    filterLabel: `${context.vehicle.plate} · ${context.vehicle.description}`,
    groupLabel: 'Vehículo',
    emptyMessage: 'El vehículo no tiene despachos registrados.',
    generatedBy: context.generatedBy,
    generatedAt: context.generatedAt,
    logoPath: context.logoPath,
    columns: reportColumns(),
    metrics: [
      { label: 'Kilometraje inicial', value: first ? `${number(first.initialOdometer)} km` : '—' },
      { label: 'Kilometraje final', value: last ? `${number(last.finalOdometer)} km` : '—' },
      { label: 'Recorrido total', value: `${formatNumber(totalDistance)} km` },
      { label: 'Tiempo total de uso', value: formatDuration(totalUsage) },
      { label: 'Número de despachos', value: ordered.length },
    ],
    groups: ordered.length ? [{
      title: `${context.vehicle.plate} · ${context.vehicle.description}`,
      rows: ordered.map((item) => ({ values: {
        dispatch: `DV-${item.code} · ${STATUS_LABELS[item.status]}`,
        responsible: `${item.responsible?.name ?? 'Sin responsable'}\n${item.zones?.map((zone) => zone.name).sort().join(', ') || 'Sin zonas'}`,
        handover: formatDateTime(item.handedOverAt),
        return: formatDateTime(item.returnedAt),
        initial: item.initialOdometer === null ? '—' : number(item.initialOdometer),
        final: item.finalOdometer === null ? '—' : number(item.finalOdometer),
        distance: item.finalOdometer === null ? '—' : formatNumber(distance(item)),
        usage: item.handedOverAt ? formatDuration(usageMilliseconds(item, context.generatedAt)) : '—',
        observations: `Entrega: ${item.handoverObservation || 'Sin observaciones'}\nRecepción: ${item.returnObservation || 'Sin observaciones'}`,
      } })),
    }] : [],
  };
}

function reportColumns(): IcarReportColumn[] {
  return [
    { key: 'dispatch', label: 'Despacho', width: 42 },
    { key: 'responsible', label: 'Distribuidor / zonas', width: 58 },
    { key: 'handover', label: 'Entrega', width: 58 },
    { key: 'return', label: 'Recepción', width: 58 },
    { key: 'initial', label: 'Km inicial', width: 38, align: 'right' },
    { key: 'final', label: 'Km final', width: 38, align: 'right' },
    { key: 'distance', label: 'Recorrido', width: 42, align: 'right' },
    { key: 'usage', label: 'Tiempo uso', width: 46 },
    { key: 'observations', label: 'Observaciones entrega / recepción', width: 168 },
  ];
}

function reportPeriod(dispatches: VehicleDispatch[], generatedAt: Date): string {
  if (!dispatches.length) return 'Sin despachos registrados';
  const start = dispatches[0].handedOverAt as Date;
  const end = dispatches.at(-1)?.returnedAt ?? generatedAt;
  return `${formatDate(start)} al ${formatDate(end)}`;
}

function distance(item: VehicleDispatch): number {
  if (item.initialOdometer === null || item.finalOdometer === null) return 0;
  return Math.max(0, Number(item.finalOdometer) - Number(item.initialOdometer));
}

function usageMilliseconds(item: VehicleDispatch, generatedAt: Date): number {
  if (!item.handedOverAt) return 0;
  return Math.max(0, (item.returnedAt ?? generatedAt).getTime() - item.handedOverAt.getTime());
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  return `${days ? `${days} d ` : ''}${hours} h ${rest} min`;
}

function formatDateTime(value: Date | null): string {
  if (!value) return 'Pendiente';
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium' }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

function number(value: string | null): string { return formatNumber(Number(value ?? 0)); }

const STATUS_LABELS: Record<VehicleDispatchStatus, string> = {
  PENDIENTE: 'Pendiente',
  ACTIVO: 'En custodia',
  DEVUELTO: 'Devuelto',
};
