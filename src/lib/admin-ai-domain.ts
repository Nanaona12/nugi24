import { z } from "zod";

export const PoDraftSchema = z.object({
  supplier: z.string(),
  notes: z.string().nullable(),
  payment_terms: z.enum(["cash", "credit"]),
  due_date: z.string().nullable(),
  invoice_no: z.string().nullable(),
  items: z.array(z.object({
    product_id: z.string().nullable(),
    product_code: z.string().nullable(),
    product_name: z.string(),
    qty: z.number(),
    unit_name: z.string(),
    unit_conversion: z.number(),
    unit_cost: z.number(),
    sell_price: z.number().nullable(),
    category: z.string().nullable(),
  })),
});
export type AdminAiPoDraft = z.infer<typeof PoDraftSchema>;

export function validatePoDraft(draft: AdminAiPoDraft) {
  if (!draft.supplier.trim() || !draft.items.length) throw new Error("Supplier dan barang wajib diisi.");
  if (draft.items.length > 500) throw new Error("Maksimal 500 baris barang per PO.");
  if (draft.payment_terms === "credit" && (!draft.due_date || !validDate(draft.due_date))) {
    throw new Error("Tanggal jatuh tempo wajib untuk pembelian tempo.");
  }
  for (const item of draft.items) {
    if (!item.product_name.trim() || !item.unit_name.trim() || !Number.isInteger(item.qty) || item.qty <= 0 ||
      !Number.isInteger(item.unit_conversion) || item.unit_conversion < 1 || !Number.isFinite(item.unit_cost) ||
      item.unit_cost < 0 || (item.sell_price !== null && (!Number.isFinite(item.sell_price) || item.sell_price < 0))) {
      throw new Error("Jumlah, satuan, atau harga barang belum valid.");
    }
  }
  return draft;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
}

export function jakartaDateRange(from: string, to: string, resetAt?: string | null) {
  if (!validDate(from) || !validDate(to) || from > to) throw new Error("Rentang tanggal tidak valid.");
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  if (resetAt && new Date(resetAt) > start) start.setTime(new Date(resetAt).getTime());
  return { start: start.toISOString(), end: end.toISOString() };
}

export function calculateProfit(
  items: { subtotal: number; unit_cost: number; qty: number }[],
  shifts: { difference: number; shortage_resolution: string | null }[],
) {
  const revenue = items.reduce((sum, it) => sum + Number(it.subtotal), 0);
  const cost = items.reduce((sum, it) => sum + Number(it.unit_cost) * Number(it.qty), 0);
  const shortage = shifts.reduce((sum, s) => sum + (s.difference < 0 &&
    (s.shortage_resolution === null || s.shortage_resolution === "store_loss") ? Math.abs(s.difference) : 0), 0);
  return { revenue, cost, gross_profit: revenue - cost, shortage, net_profit: revenue - cost - shortage };
}

export function assertOwnedProducts(ids: (string | null)[], ownedIds: Set<string>) {
  if (ids.some((id) => id !== null && !ownedIds.has(id))) throw new Error("Produk bukan milik toko aktif.");
}