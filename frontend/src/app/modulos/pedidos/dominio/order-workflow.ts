import { PublicTrackingStatus } from '../../../compartido/modelos';

export const ORDER_WORKFLOW_LABELS: Record<PublicTrackingStatus, string> = {
  BORRADOR: 'Borrador', RECIBIDO: 'Recibido', PEDIDO_CONFIRMADO: 'Aprobado', CANCELADO: 'Cancelado',
  EN_PREPARACION: 'En preparación', DISPONIBLE_PARA_PREPARAR: 'Disponible para preparar',
  PREPARADO: 'Preparado', ASIGNADO: 'Asignado', EN_RUTA: 'En reparto', ENTREGADO: 'Entregado',
  ENTREGA_PARCIAL: 'Entrega parcial', ENTREGA_NO_COMPLETADA: 'No entregado',
};
export function workflowLabel(status?: string): string {
  return ORDER_WORKFLOW_LABELS[status as PublicTrackingStatus] ?? status ?? '—';
}

const WORKFLOW_PALETTE: Record<PublicTrackingStatus, readonly [string, string]> = {
  BORRADOR: ['#f1f5f9', '#475569'],
  RECIBIDO: ['#dbeafe', '#1d4ed8'],
  PEDIDO_CONFIRMADO: ['#e0e7ff', '#4338ca'],
  EN_PREPARACION: ['#fef3c7', '#92400e'],
  DISPONIBLE_PARA_PREPARAR: ['#cffafe', '#0e7490'],
  PREPARADO: ['#ccfbf1', '#0f766e'],
  ASIGNADO: ['#f3e8ff', '#7e22ce'],
  EN_RUTA: ['#ffedd5', '#c2410c'],
  ENTREGADO: ['#dcfce7', '#166534'],
  ENTREGA_PARCIAL: ['#fce7f3', '#9d174d'],
  ENTREGA_NO_COMPLETADA: ['#f5e6d3', '#78350f'],
  CANCELADO: ['#fee2e2', '#991b1b'],
};

const WORKFLOW_STYLES: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(WORKFLOW_PALETTE).map(([status, [backgroundColor, color]]) => [status, {
    backgroundColor, color, border: `1px solid ${color}`,
  }]),
);

export function workflowStyle(status?: string): Record<string, string> {
  const normalized = status === 'CONFIRMADO' ? 'PEDIDO_CONFIRMADO' : status;
  return WORKFLOW_STYLES[normalized as PublicTrackingStatus] ?? WORKFLOW_STYLES['BORRADOR'];
}
