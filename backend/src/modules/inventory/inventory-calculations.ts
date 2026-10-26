export function projectedAvailableQuantity(
  physicalQuantity: number,
  reservedQuantity: number,
  scale: number,
): number {
  const multiplier = 10 ** scale;
  return Math.round(
    (physicalQuantity - reservedQuantity + Number.EPSILON) * multiplier,
  ) / multiplier;
}
