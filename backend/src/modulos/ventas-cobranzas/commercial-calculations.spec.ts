import { describe, expect, it } from 'vitest';
import { addDays, agingRange, centsToMoney, lineSubtotalCents, moneyToCents } from './commercial-calculations';

describe('cálculos comerciales', () => {
  it('calcula líneas con cantidad decimal y redondeo a dos decimales', () => {
    expect(lineSubtotalCents('1.255', '10.10', '0.25')).toBe(1243);
    expect(centsToMoney(1243)).toBe('12.43');
  });

  it('conserva precisión monetaria sin coma flotante', () => {
    expect(moneyToCents('540.00')).toBe(54000);
    expect(centsToMoney(moneyToCents('300.00') + moneyToCents('240.00'))).toBe('540.00');
  });

  it('calcula vencimiento y límites de antigüedad', () => {
    expect(addDays('2026-09-21', 30)).toBe('2026-10-21');
    expect(agingRange('2026-01-01', '2026-01-31')).toBe('1_30');
    expect(agingRange('2026-01-01', '2026-03-02')).toBe('31_60');
    expect(agingRange('2026-01-01', '2026-04-02')).toBe('MAS_90');
  });
});
