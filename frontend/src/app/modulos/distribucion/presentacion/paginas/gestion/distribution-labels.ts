export function distributionStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    EN_PREPARACION: 'EN PREPARACIÓN',
    EN_REPARTO: 'EN REPARTO',
    ENTREGA_PARCIAL: 'ENTREGA PARCIAL',
    NO_ENTREGADA: 'NO ENTREGADA',
  };
  return labels[value] ?? value;
}
