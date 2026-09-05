import { supabase } from "@/integrations/supabase/client";

export type SupplierDebt = {
  id: string;
  tenant_id: string;
  po_id: string | null;
  supplier: string;
  invoice_no: string | null;
  total: number;
  paid_amount: number;
  saved_amount: number;
  due_date: string | null;
  status: "open" | "partial" | "paid";
  note: string | null;
  created_at: string;
};

export type SupplierDebtSaving = {
  id: string;
  debt_id: string;
  amount: number;
  note: string | null;
  created_at: string;
};

/**
 * Estimasi nabung untuk melunasi faktur sebelum jatuh tempo.
 * kurang = sisa hutang - uang yang sudah ditabung
 */
export function savingPlan(debt: {
  total: number | string;
  paid_amount: number | string;
  saved_amount: number | string | null;
  due_date: string | null;
  status: string;
}) {
  const sisa = Math.max(Number(debt.total) - Number(debt.paid_amount), 0);
  const saved = Math.max(Number(debt.saved_amount || 0), 0);
  const kurang = Math.max(sisa - saved, 0);
  const percent = sisa > 0 ? Math.min(Math.round((saved / sisa) * 100), 100) : 100;
  let daysLeft: number | null = null;
  if (debt.due_date && debt.status !== "paid") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysLeft = Math.round(
      (new Date(debt.due_date + "T00:00:00").getTime() - today.getTime()) / 86400000,
    );
  }
  const effectiveDays = daysLeft != null && daysLeft > 0 ? daysLeft : null;
  const perDay = kurang > 0 && effectiveDays ? Math.ceil(kurang / effectiveDays) : null;
  const perWeek = kurang > 0 && effectiveDays ? Math.ceil(kurang / Math.max(effectiveDays / 7, 1)) : null;
  return { sisa, saved, kurang, percent, daysLeft, perDay, perWeek };
}

export type SupplierDebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  method: string;
  note: string | null;
  created_at: string;
};

/**
 * Dipanggil setelah PO diterima:
 * - Termin tunai  -> catat uang keluar di pembukuan (sekali saja)
 * - Termin tempo  -> buat catatan hutang supplier (sekali saja), kas tidak berkurang
 */
export async function settlePoFinance(poId: string) {
  const { data: po } = await (supabase as any)
    .from("purchase_orders")
    .select("id, tenant_id, supplier, total, payment_terms, due_date, supplier_invoice_no, created_at")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return;

  const total = Number(po.total || 0);
  if (total <= 0) return;

  if (po.payment_terms === "credit") {
    const { data: existing } = await (supabase as any)
      .from("supplier_debts")
      .select("id")
      .eq("po_id", poId)
      .maybeSingle();
    if (existing) return;
    const { data: userRes } = await supabase.auth.getUser();
    await (supabase as any).from("supplier_debts").insert({
      tenant_id: po.tenant_id,
      po_id: poId,
      supplier: po.supplier,
      invoice_no: po.supplier_invoice_no || null,
      total,
      due_date: po.due_date || null,
      created_by: userRes.user?.id ?? null,
    });
    return;
  }

  // Tunai: catat pengeluaran pembukuan sekali saja
  const { data: exists } = await (supabase as any)
    .from("bookkeeping_entries")
    .select("id")
    .eq("ref", poId)
    .eq("kind", "out")
    .maybeSingle();
  if (exists) return;
  await (supabase as any).from("bookkeeping_entries").insert({
    tenant_id: po.tenant_id,
    entry_date: new Date().toISOString(),
    kind: "out",
    description: `Pembelian tunai: ${po.supplier}${po.supplier_invoice_no ? ` (Faktur ${po.supplier_invoice_no})` : ""}`,
    ref: poId,
    amount: total,
  });
}

export function debtDueInfo(due: string | null, status: string) {
  if (status === "paid" || !due) return { days: null as number | null, label: "", tone: "" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { days, label: `Terlambat ${Math.abs(days)} hari`, tone: "overdue" };
  if (days === 0) return { days, label: "Jatuh tempo hari ini", tone: "today" };
  if (days <= 3) return { days, label: `${days} hari lagi`, tone: "soon" };
  return { days, label: `${days} hari lagi`, tone: "ok" };
}

export async function loadDueSoonCount(): Promise<number> {
  const limit = new Date();
  limit.setDate(limit.getDate() + 3);
  const { data } = await (supabase as any)
    .from("supplier_debts")
    .select("id, due_date, status")
    .neq("status", "paid");
  return ((data || []) as SupplierDebt[]).filter(
    (d) => d.due_date && new Date(d.due_date + "T00:00:00") <= limit,
  ).length;
}

export async function loadOutstandingSupplierDebt(): Promise<number> {
  const { data } = await (supabase as any)
    .from("supplier_debts")
    .select("total, paid_amount, status")
    .neq("status", "paid");
  return ((data || []) as SupplierDebt[]).reduce(
    (s, d) => s + (Number(d.total) - Number(d.paid_amount)),
    0,
  );
}
