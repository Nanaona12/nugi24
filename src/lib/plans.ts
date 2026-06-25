// Subscription plans & pricing for Dagang Pintar
// Yearly = ~10x monthly (hemat 2 bulan)

export type PlanId = "warung" | "grosir";
export type BillingPeriod = "monthly" | "yearly";

export type PlanDef = {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  /** If true, plan can only be billed monthly (no yearly option). */
  monthlyOnly?: boolean;
  highlight?: boolean;
  features: string[];
  /** Features unique to this tier vs the lower one. */
  unlocks?: string[];
};

export const PLANS: Record<PlanId, PlanDef> = {
  warung: {
    id: "warung",
    name: "Paket Warung",
    tagline: "Cocok untuk warung kecil & UMKM eceran",
    monthly: 14_900,
    yearly: 149_000, // hemat 2 bulan (≈Rp 29.800)
    features: [
      "Kasir + cetak struk thermal",
      "Manajemen produk & stok",
      "Riwayat transaksi & export Excel/CSV",
      "Laporan keuntungan harian/bulanan",
      "1 akun kasir aktif",
      "Scan barcode (kamera & USB)",
      "Pelanggan dasar (kontak & catatan)",
    ],
  },
  grosir: {
    id: "grosir",
    name: "Paket Grosiran",
    tagline: "Untuk grosir, distributor & toko skala menengah",
    monthly: 29_900,
    yearly: 299_000, // hemat 2 bulan (≈Rp 59.800)
    highlight: true,
    features: [
      "Semua fitur Paket Warung",
      "Multi-satuan harga: eceran / slove / dus / karton",
      "Multi-kasir tanpa batas + log absen per kasir",
      "Closing shift detail + rekonsiliasi kas",
      "Purchase Order (PO) ke supplier",
      "Hutang pelanggan & pembayaran cicilan",
      "Pengambilan barang rumah tangga (owner use)",
      "Tracking kadaluarsa per batch (FEFO otomatis)",
      "Import / export Excel lengkap (produk + batch)",
      "Laporan PDF profesional & total aset inventori",
      "Prioritas dukungan WhatsApp",
    ],
    unlocks: [
      "Multi-satuan harga (slove / dus)",
      "Multi-kasir tanpa batas",
      "Purchase Order ke supplier",
      "Hutang pelanggan (kasbon)",
      "Tracking kadaluarsa FEFO",
      "Closing shift & rekonsiliasi kas",
      "Total aset inventori",
      "Laporan PDF lengkap",
    ],
  },
};

export function priceFor(plan: PlanId, period: BillingPeriod): number {
  const p = PLANS[plan];
  if (p.monthlyOnly) return p.monthly;
  return period === "yearly" ? p.yearly : p.monthly;
}

export function daysFor(period: BillingPeriod): number {
  return period === "yearly" ? 365 : 30;
}

export function yearlySavingPct(plan: PlanId): number {
  const m = PLANS[plan].monthly * 12;
  if (m === 0) return 0;
  return Math.round(((m - PLANS[plan].yearly) / m) * 100);
}

export function isGrosirPlan(plan?: string | null): boolean {
  return plan === "grosir";
}
