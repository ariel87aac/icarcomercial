import { describe, expect, it } from 'vitest';
import { movementAmounts, summarizeKardex } from './inventory-kardex.calculations';

describe('cálculos del Kardex de Almacén', () => {
  it('clasifica ingresos y salidas por la variación real del saldo', () => {
    expect(movementAmounts({ previousBalance: '10', newBalance: '14' })).toEqual({ entry: 4, exit: 0 });
    expect(movementAmounts({ previousBalance: '14', newBalance: '9' })).toEqual({ entry: 0, exit: 5 });
  });

  it('concilia saldo inicial, ingresos, salidas y saldo final', () => {
    const summary = summarizeKardex([
      { previousBalance: '10', newBalance: '14' },
      { previousBalance: '14', newBalance: '9' },
    ]);
    expect(summary).toEqual({ openingBalance: 10, totalEntries: 4, totalExits: 5, closingBalance: 9 });
    expect(summary.openingBalance + summary.totalEntries - summary.totalExits).toBe(summary.closingBalance);
  });

  it('conserva el saldo anterior cuando el rango no tiene movimientos', () => {
    expect(summarizeKardex([], 27)).toEqual({ openingBalance: 27, totalEntries: 0, totalExits: 0, closingBalance: 27 });
  });
});
