// Helpers untuk satuan & tingkatan harga produk
import { supabase } from "@/integrations/supabase/client";

export type PriceTier = {
  id?: string;
  min_qty: number;
  price: number;
};

export type ProductUnit = {
  id?: string;
  product_id?: string;
  name: string;        // misal "pcs", "slove", "dus"
  conversion: number;  // berapa unit dasar per 1 satuan ini (pcs=1, slove=10, dus=60)
  sort_order: number;
  is_base: boolean;
  show_in_showcase?: boolean; // tampilkan tingkatan harga satuan ini di galeri publik
  tiers: PriceTier[];  // diurutkan ascending by min_qty
};

/** Pilih tier harga terbaik berdasarkan jumlah beli (qty dalam satuan tsb). */
export function tierPriceFor(unit: ProductUnit, qty: number): { price: number; tier: PriceTier | null } {
  if (!unit.tiers || unit.tiers.length === 0) return { price: 0, tier: null };
  const sorted = [...unit.tiers].sort((a, b) => a.min_qty - b.min_qty);
  let chosen: PriceTier = sorted[0];
  for (const t of sorted) {
    if (qty >= t.min_qty) chosen = t;
  }
  return { price: Number(chosen.price), tier: chosen };
}

/** Muat units + tiers untuk daftar product id (batched + paginated agar aman utk banyak produk). */
export async function loadUnitsForProducts(productIds: string[]): Promise<Record<string, ProductUnit[]>> {
  if (productIds.length === 0) return {};

  const CHUNK = 100;  // batasi panjang URL utk .in()
  const PAGE = 1000;  // batas default PostgREST per query

  const unitList: any[] = [];
  for (let i = 0; i < productIds.length; i += CHUNK) {
    const idsChunk = productIds.slice(i, i + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from("product_units")
        .select("*")
        .in("product_id", idsChunk)
        .order("sort_order", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as any[];
      unitList.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const unitIds = unitList.map((u) => u.id);
  const tiersByUnit: Record<string, PriceTier[]> = {};
  for (let i = 0; i < unitIds.length; i += CHUNK) {
    const idsChunk = unitIds.slice(i, i + CHUNK);
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from("product_price_tiers")
        .select("*")
        .in("product_unit_id", idsChunk)
        .order("min_qty", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as any[];
      for (const t of rows) {
        (tiersByUnit[t.product_unit_id] ||= []).push({ id: t.id, min_qty: t.min_qty, price: Number(t.price) });
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const byProduct: Record<string, ProductUnit[]> = {};
  for (const u of unitList) {
    (byProduct[u.product_id] ||= []).push({
      id: u.id,
      product_id: u.product_id,
      name: u.name,
      conversion: u.conversion,
      sort_order: u.sort_order,
      is_base: u.is_base,
      show_in_showcase: u.show_in_showcase !== false,
      tiers: tiersByUnit[u.id] || [],
    });
  }
  return byProduct;
}

/** Bangun unit fallback dari kolom lama products (price/wholesale). */
export function fallbackUnitFromProduct(p: { price: number; wholesale_price: number | null; wholesale_min_qty: number | null }): ProductUnit {
  const tiers: PriceTier[] = [{ min_qty: 1, price: Number(p.price) }];
  if (p.wholesale_price && p.wholesale_min_qty && p.wholesale_min_qty > 1) {
    tiers.push({ min_qty: p.wholesale_min_qty, price: Number(p.wholesale_price) });
  }
  return { name: "pcs", conversion: 1, sort_order: 0, is_base: true, tiers };
}

/** Ganti seluruh unit + tier produk (hapus lama, insert baru). */
export async function replaceProductUnits(productId: string, units: ProductUnit[]): Promise<void> {
  const { error: delErr } = await (supabase as any).from("product_units").delete().eq("product_id", productId);
  if (delErr) throw delErr;
  if (units.length === 0) return;
  const unitRows = units.map((u, i) => ({
    product_id: productId,
    name: u.name.trim(),
    conversion: Math.max(1, Math.floor(u.conversion || 1)),
    sort_order: i,
    is_base: u.is_base,
  }));
  const { data: inserted, error: insErr } = await (supabase as any)
    .from("product_units")
    .insert(unitRows)
    .select();
  if (insErr) throw insErr;
  const tierRows: any[] = [];
  (inserted as any[]).forEach((row, i) => {
    const src = units[i];
    src.tiers.forEach((t, ti) => {
      if (!t.min_qty || t.price == null) return;
      tierRows.push({
        product_unit_id: row.id,
        min_qty: Math.max(1, Math.floor(t.min_qty)),
        price: Number(t.price),
        sort_order: ti,
      });
    });
  });
  if (tierRows.length > 0) {
    const { error: tErr } = await (supabase as any).from("product_price_tiers").insert(tierRows);
    if (tErr) throw tErr;
  }
}
