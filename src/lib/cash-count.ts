export const CASH_DENOMINATIONS = [100000, 75000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100] as const;

export function cashCountTotal(counts: Record<number, string>): number {
  return CASH_DENOMINATIONS.reduce((total, denomination) => {
    const raw = counts[denomination] ?? "";
    const count = /^\d+$/.test(raw) ? Number(raw) : 0;
    return total + (Number.isSafeInteger(count) ? denomination * count : 0);
  }, 0);
}