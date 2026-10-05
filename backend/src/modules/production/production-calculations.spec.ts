import { describe, expect, it } from 'vitest';
import {
  baseContribution,
  decimalForScale,
  pendingQuantity,
  productionDifference,
  roundForScale,
} from './production-calculations';

describe('cálculos de consolidación para Producción', () => {
  it('convierte una presentación a la unidad base respetando la precisión de la unidad', () => {
    expect(baseContribution(3.25, 2.5, 3)).toBe(8.125);
    expect(baseContribution(1.234, 0.5, 2)).toBe(0.62);
    expect(decimalForScale(0.62, 2)).toBe('0.62');
  });

  it('acumula y redondea cantidades con una única regla decimal', () => {
    const first = baseContribution(1.111, 3, 3);
    const second = baseContribution(2.222, 3, 3);
    expect(roundForScale(first + second, 3)).toBe(9.999);
  });

  it('calcula faltante, cumplimiento exacto y excedente con su signo', () => {
    expect(productionDifference(7, 10, 3)).toBe(-3);
    expect(productionDifference(10, 10, 3)).toBe(0);
    expect(productionDifference(12.5, 10, 3)).toBe(2.5);
    expect(pendingQuantity(12.5, 10, 3)).toBe(0);
    expect(pendingQuantity(7, 10, 3)).toBe(3);
  });
});
