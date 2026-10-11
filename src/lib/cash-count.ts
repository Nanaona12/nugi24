export function cashCountTotal(amounts: readonly string[]): number {
  return amounts.reduce((total, raw) => {
    const normalized = raw.trim();
    const valid = /^\d+$/.test(normalized) || /^\d{1,3}(\.\d{3})+$/.test(normalized);
    const amount = valid ? Number(normalized.replace(/\./g, "")) : 0;
    return total + (Number.isSafeInteger(amount) ? amount : 0);
  }, 0);
}