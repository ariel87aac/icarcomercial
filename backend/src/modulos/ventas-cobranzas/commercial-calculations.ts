export type AgingRange = 'VIGENTE' | '1_30' | '31_60' | '61_90' | 'MAS_90';

export function moneyToCents(value: string | number): number {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Importe monetario inválido');
  const [whole, decimals = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

export function quantityToMilli(value: string | number): number {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error('Cantidad inválida');
  const [whole, decimals = ''] = normalized.split('.');
  return Number(whole) * 1000 + Number(decimals.padEnd(3, '0'));
}

export function lineSubtotalCents(quantity: string | number, unitPrice: string | number, discount: string | number = 0): number {
  const quantityMilli = BigInt(quantityToMilli(quantity));
  const priceCents = BigInt(moneyToCents(unitPrice));
  const gross = Number((quantityMilli * priceCents + 500n) / 1000n);
  return Math.max(0, gross - moneyToCents(discount));
}

export function centsToMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Importe fuera de rango');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysPastDue(dueDate: string, cutoffDate: string): number {
  const due = Date.parse(`${dueDate}T00:00:00.000Z`);
  const cutoff = Date.parse(`${cutoffDate}T00:00:00.000Z`);
  return Math.max(0, Math.floor((cutoff - due) / 86_400_000));
}

export function agingRange(dueDate: string, cutoffDate: string): AgingRange {
  const days = daysPastDue(dueDate, cutoffDate);
  if (days === 0) return 'VIGENTE';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return 'MAS_90';
}
