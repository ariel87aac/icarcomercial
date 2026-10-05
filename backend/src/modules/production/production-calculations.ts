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

export function pendingQuantity(prepared: number, requested: number, scale: number): number {
  return roundForScale(Math.max(requested - prepared, 0), scale);
}
