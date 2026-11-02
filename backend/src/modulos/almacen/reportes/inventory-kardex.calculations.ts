export interface KardexBalanceRow {
  previousBalance: string | number;
  newBalance: string | number;
}

export interface KardexSummary {
  openingBalance: number;
  totalEntries: number;
  totalExits: number;
  closingBalance: number;
}

export function movementAmounts(row: KardexBalanceRow): { entry: number; exit: number } {
  const delta = Number(row.newBalance) - Number(row.previousBalance);
  return { entry: Math.max(delta, 0), exit: Math.max(-delta, 0) };
}

export function summarizeKardex(rows: KardexBalanceRow[], openingFallback = 0): KardexSummary {
  const openingBalance = rows.length ? Number(rows[0].previousBalance) : openingFallback;
  const totals = rows.reduce((result, row) => {
    const amounts = movementAmounts(row);
    result.totalEntries += amounts.entry;
    result.totalExits += amounts.exit;
    return result;
  }, { totalEntries: 0, totalExits: 0 });
  return {
    openingBalance,
    ...totals,
    closingBalance: rows.length ? Number(rows.at(-1)?.newBalance) : openingBalance,
  };
}
