export const formatRupiah = (n: number): string => {
  if (!Number.isFinite(n)) return "Rp 0";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
};

export const parseNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
