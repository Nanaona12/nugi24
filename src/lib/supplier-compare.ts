// Helper perbandingan harga modal antar supplier (berdasarkan item PO yang diterima)
import { supabase } from "@/integrations/supabase/client";

export type PurchaseRow = {
  poId: string;
  supplier: string;
  createdAt: string;
  unitName: string;
  qty: number;
  qtyReceived: number;
  unitCost: number;
  unitConversion: number;
  perBase: number; // harga per unit dasar (pcs)
};

export type SupplierStat = {
  supplier: string;
  count: number;
  totalQtyBase: number;
  lastPerBase: number;
  lastAt: string;
  minPerBase: number;
  maxPerBase: number;
  avgPerBase: number;
};

const RECEIVED = ["full", "partial"];

/** Ambil riwayat pembelian sebuah produk dari PO yang sudah diterima. */
export async function loadPurchaseRows(productId: string, productCode?: string): Promise<PurchaseRow[]> {
  const filter = productCode
    ? `product_id.eq.${productId},product_code.eq.${productCode}`
    : `product_id.eq.${productId}`;
  const { data, error } = await (supabase as any)
    .from("purchase_order_items")
    .select(
      "po_id, qty, qty_received, unit_name, unit_conversion, unit_cost, purchase_orders:po_id(id, supplier, created_at, received_status)",
    )
    .or(filter)
    .limit(500);
  if (error) throw error;

  const rows: PurchaseRow[] = [];
  for (const r of (data || []) as any[]) {
    const po = r.purchase_orders;
    if (!po) continue;
    if (!RECEIVED.includes(String(po.received_status || "none"))) continue;
    const conv = Math.max(1, Number(r.unit_conversion) || 1);
    const cost = Number(r.unit_cost) || 0;
    if (cost <= 0) continue;
    rows.push({
      poId: po.id,
      supplier: (po.supplier || "-").trim() || "-",
      createdAt: po.created_at,
      unitName: r.unit_name || "pcs",
      qty: Number(r.qty) || 0,
      qtyReceived: Number(r.qty_received) || 0,
      unitCost: cost,
      unitConversion: conv,
      perBase: cost / conv,
    });
  }
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return rows;
}

/** Ringkas riwayat pembelian jadi statistik per supplier. */
export function summarizeBySupplier(rows: PurchaseRow[]): SupplierStat[] {
  const map = new Map<string, PurchaseRow[]>();
  for (const r of rows) {
    const list = map.get(r.supplier) || [];
    list.push(r);
    map.set(r.supplier, list);
  }
  const out: SupplierStat[] = [];
  for (const [supplier, list] of map) {
    const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const prices = sorted.map((r) => r.perBase);
    out.push({
      supplier,
      count: sorted.length,
      totalQtyBase: sorted.reduce((s, r) => s + Math.max(r.qtyReceived, r.qty) * r.unitConversion, 0),
      lastPerBase: prices[0],
      lastAt: sorted[0].createdAt,
      minPerBase: Math.min(...prices),
      maxPerBase: Math.max(...prices),
      avgPerBase: prices.reduce((s, p) => s + p, 0) / prices.length,
    });
  }
  return out.sort((a, b) => a.lastPerBase - b.lastPerBase);
}

export type CheapestInfo = { supplier: string; perBase: number };

/** Peta produk -> supplier termurah (harga terakhir per unit dasar). */
export async function loadCheapestSupplierMap(): Promise<Record<string, CheapestInfo>> {
  const { data, error } = await (supabase as any)
    .from("purchase_order_items")
    .select("product_id, unit_cost, unit_conversion, purchase_orders:po_id(supplier, created_at, received_status)")
    .not("product_id", "is", null)
    .limit(5000);
  if (error) throw error;

  const best: Record<string, CheapestInfo> = {};
  for (const r of (data || []) as any[]) {
    const po = r.purchase_orders;
    if (!po || !RECEIVED.includes(String(po.received_status || "none"))) continue;
    const conv = Math.max(1, Number(r.unit_conversion) || 1);
    const cost = Number(r.unit_cost) || 0;
    if (cost <= 0) continue;
    const perBase = cost / conv;
    const cur = best[r.product_id];
    if (!cur || perBase < cur.perBase) {
      best[r.product_id] = { supplier: (po.supplier || "-").trim() || "-", perBase };
    }
  }
  return best;
}
