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

/** Parse jumlah yang boleh pakai koma/titik desimal: "1,2" -> 1.2. NaN bila tidak valid. */
export const parseDecimalQty = (v: string): number => {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return NaN;
  return Number(s);
};

/** Tampilkan jumlah desimal gaya Indonesia, maks 3 angka di belakang koma. */
export const formatQty = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toLocaleString("id-ID", { maximumFractionDigits: 3 });

/** Konversi jumlah satuan (boleh desimal) ke unit dasar bulat, mis. 1,2 kg × 1000 = 1200 gram. */
export const toBaseQty = (qty: number, conversion: number): number =>
  Math.round(qty * Math.max(1, conversion));

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
