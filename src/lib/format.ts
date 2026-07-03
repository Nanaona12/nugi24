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

// Barcode dapat berisi lebih dari satu kode (mis. barcode dus & barcode pcs)
// yang dipisahkan koma, titik-koma, spasi, atau baris baru.
export const parseBarcodes = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(/[\s,;\n\r\t|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const barcodeMatches = (raw: string | null | undefined, scanned: string): boolean => {
  const s = scanned.trim().toLowerCase();
  if (!s) return false;
  return parseBarcodes(raw).some((b) => b.toLowerCase() === s);
};

export const barcodeIncludes = (raw: string | null | undefined, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return parseBarcodes(raw).some((b) => b.toLowerCase().includes(q));
};
