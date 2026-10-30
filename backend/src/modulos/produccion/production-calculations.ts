export function roundForScale(value: number, scale: number): number {
  const multiplier = 10 ** scale;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function decimalForScale(value: number, scale: number): string {
  return value.toFixed(scale);
}

export function baseContribution(quantity: number, factor: number, scale: number): number {
  return roundForScale(quantity * factor, scale);
}

export function productionDifference(prepared: number, requested: number, scale: number): number {
  return roundForScale(prepared - requested, scale);
}

export function productionRequirement(demand: number, warehouseCovered: number, scale: number): number {
  return roundForScale(Math.max(demand - warehouseCovered, 0), scale);
}

export function batchAdjustment(planned: number, required: number, scale: number): number {
  return roundForScale(Math.max(planned - required, 0), scale);
}

export function pendingQuantity(prepared: number, requested: number, scale: number): number {
  return roundForScale(Math.max(requested - prepared, 0), scale);
}
