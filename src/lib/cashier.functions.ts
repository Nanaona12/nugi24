import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ----- PBKDF2 (Web Crypto, Worker-compatible) -----
const ITER = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toB64(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function fromB64(b64: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
async function pbkdf2(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITER, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return toB64(bits);
}
function timingSafeEqualStr(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getTenantId(ctx: any): Promise<string> {
  const { data: t, error } = await ctx.supabase
    .from("tenants")
    .select("id")
    .eq("owner_user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (t) return t.id as string;
  // Cashier shared session
  const { data: m } = await ctx.supabase
    .from("tenant_cashier_users")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (m) return (m as any).tenant_id as string;
  throw new Error("Toko tidak ditemukan");
}

async function isCashierSession(ctx: any): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("tenant_cashier_users")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return !!data;
}

/** Server-side subscription gate. Throws if the tenant's subscription has expired. */
async function assertActiveSubscription(tenantId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: s } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!s) throw new Error("Langganan tidak ditemukan");
  const end = new Date((s as any).current_period_end).getTime();
  if (!Number.isFinite(end) || end < Date.now()) {
    throw new Error("Langganan toko sudah berakhir. Silakan perpanjang langganan.");
  }
}

function validatePin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN harus 4-6 angka");
}

// ----- Cashier CRUD -----

export const listCashiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantId(context);
    const { data, error } = await context.supabase
      .from("cashiers")
      .select("id, name, active, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; pin: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.name?.trim()) throw new Error("Nama kasir wajib");
    validatePin(data.pin);
    const tenantId = await getTenantId(context);
    await assertActiveSubscription(tenantId);
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await pbkdf2(data.pin, salt);
    const { data: row, error } = await context.supabase
      .from("cashiers")
      .insert({ tenant_id: tenantId, name: data.name.trim(), pin_hash: hash, pin_salt: toB64(salt), active: true })
      .select("id, name, active")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name?: string; active?: boolean; newPin?: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    const patch: Record<string, any> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("Nama tidak boleh kosong");
      patch.name = data.name.trim();
    }
    if (data.active !== undefined) patch.active = !!data.active;
    if (data.newPin) {
      validatePin(data.newPin);
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      patch.pin_hash = await pbkdf2(data.newPin, salt);
      patch.pin_salt = toB64(salt);
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("cashiers")
      .update(patch as any)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCashier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    // Soft-delete via active=false if there's an open or historical shift; else hard delete.
    const { data: shifts } = await context.supabase
      .from("cashier_shifts")
      .select("id")
      .eq("cashier_id", data.id)
      .eq("tenant_id", tenantId)
      .limit(1);
    if (shifts && shifts.length > 0) {
      const { error } = await context.supabase
        .from("cashiers")
        .update({ active: false })
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { ok: true, softDeleted: true };
    }
    const { error } = await context.supabase
      .from("cashiers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true, softDeleted: false };
  });

// ----- PIN verification + open shift -----

/** Verify PIN and return cashier info + any currently-open shift. */
export const verifyCashierPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cashier_id: string; pin: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    await assertActiveSubscription(tenantId);
    // pin_hash/pin_salt are revoked from authenticated; use admin client after tenant scoping.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin
      .from("cashiers")
      .select("id, name, active, pin_hash, pin_salt, tenant_id")
      .eq("id", data.cashier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Kasir tidak ditemukan");
    if (!c.active) throw new Error("Kasir tidak aktif");
    const salt = fromB64((c as any).pin_salt as string);
    const tryHash = await pbkdf2(data.pin, salt);
    if (!timingSafeEqualStr(tryHash, (c as any).pin_hash as string)) throw new Error("PIN salah");
    const { data: openShift } = await context.supabase
      .from("cashier_shifts")
      .select("id, opened_at, opening_cash")
      .eq("cashier_id", (c as any).id)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .maybeSingle();
    return { cashier: { id: (c as any).id, name: (c as any).name }, openShift: openShift ?? null };
  });

export const openShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cashier_id: string; opening_cash: number }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    await assertActiveSubscription(tenantId);
    // Ensure cashier belongs to this tenant
    const { data: c } = await context.supabase
      .from("cashiers").select("id, active").eq("id", data.cashier_id).eq("tenant_id", tenantId).maybeSingle();
    if (!c) throw new Error("Kasir tidak ditemukan");
    if (!c.active) throw new Error("Kasir tidak aktif");
    // Reject if there is already an open shift
    const { data: existing } = await context.supabase
      .from("cashier_shifts").select("id").eq("cashier_id", data.cashier_id).eq("status", "open").maybeSingle();
    if (existing) return { shift_id: existing.id, reused: true };
    const { data: row, error } = await context.supabase
      .from("cashier_shifts")
      .insert({
        tenant_id: tenantId,
        cashier_id: data.cashier_id,
        opening_cash: Math.max(0, Number(data.opening_cash) || 0),
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { shift_id: row.id, reused: false };
  });

// ----- Shift state -----

export const getShiftSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shift_id: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    const { data: s, error } = await context.supabase
      .from("cashier_shifts")
      .select("*, cashiers(name)")
      .eq("id", data.shift_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!s) throw new Error("Shift tidak ditemukan");

    const [{ data: txs }, { data: exps }] = await Promise.all([
      context.supabase
        .from("transactions")
        .select("id, total, payment_method, created_at")
        .eq("shift_id", data.shift_id)
        .eq("tenant_id", tenantId),
      context.supabase
        .from("shift_expenses")
        .select("id, label, amount, created_at")
        .eq("shift_id", data.shift_id)
        .eq("tenant_id", tenantId)
        .order("created_at"),
    ]);
    let total_sales = 0, total_cash = 0, total_qris = 0, total_other = 0, total_transactions = 0;
    for (const t of (txs ?? []) as any[]) {
      const amt = Number(t.total) || 0;
      total_sales += amt;
      total_transactions += 1;
      if (t.payment_method === "cash") total_cash += amt;
      else if (t.payment_method === "qris") total_qris += amt;
      else total_other += amt;
    }
    const total_expenses = ((exps ?? []) as any[]).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const opening_cash = Number(s.opening_cash) || 0;
    const expected_cash = opening_cash + total_cash - total_expenses;

    return {
      shift: s,
      cashier_name: (s as any).cashiers?.name ?? "",
      totals: { total_sales, total_cash, total_qris, total_other, total_transactions, total_expenses, expected_cash, opening_cash },
      expenses: (exps ?? []) as { id: string; label: string; amount: number; created_at: string }[],
    };
  });

export const addShiftExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shift_id: string; label: string; amount: number }) => d)
  .handler(async ({ data, context }) => {
    if (!data.label?.trim()) throw new Error("Label wajib");
    const amt = Math.max(0, Number(data.amount) || 0);
    if (amt <= 0) throw new Error("Nominal harus > 0");
    const tenantId = await getTenantId(context);
    await assertActiveSubscription(tenantId);
    // Confirm shift belongs to tenant & open
    const { data: s } = await context.supabase
      .from("cashier_shifts").select("id, status").eq("id", data.shift_id).eq("tenant_id", tenantId).maybeSingle();
    if (!s) throw new Error("Shift tidak ditemukan");
    if (s.status !== "open") throw new Error("Shift sudah ditutup");
    const { error } = await context.supabase
      .from("shift_expenses")
      .insert({ tenant_id: tenantId, shift_id: data.shift_id, label: data.label.trim(), amount: amt });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteShiftExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    const { error } = await context.supabase
      .from("shift_expenses").delete().eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shift_id: string; actual_cash: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const tenantId = await getTenantId(context);
    // Recompute totals server-side for trust
    const { data: txs } = await context.supabase
      .from("transactions").select("total, payment_method").eq("shift_id", data.shift_id).eq("tenant_id", tenantId);
    const { data: exps } = await context.supabase
      .from("shift_expenses").select("amount").eq("shift_id", data.shift_id).eq("tenant_id", tenantId);
    let total_sales = 0, total_cash = 0, total_qris = 0, total_other = 0, total_transactions = 0;
    for (const t of (txs ?? []) as any[]) {
      const amt = Number(t.total) || 0;
      total_sales += amt;
      total_transactions += 1;
      if (t.payment_method === "cash") total_cash += amt;
      else if (t.payment_method === "qris") total_qris += amt;
      else total_other += amt;
    }
    const total_expenses = ((exps ?? []) as any[]).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const { data: cur } = await context.supabase
      .from("cashier_shifts").select("opening_cash, status").eq("id", data.shift_id).eq("tenant_id", tenantId).maybeSingle();
    if (!cur) throw new Error("Shift tidak ditemukan");
    if (cur.status !== "open") throw new Error("Shift sudah ditutup");
    const opening_cash = Number(cur.opening_cash) || 0;
    const expected_cash = opening_cash + total_cash - total_expenses;
    const actual_cash = Math.max(0, Number(data.actual_cash) || 0);
    const difference = actual_cash - expected_cash;

    const { error } = await context.supabase
      .from("cashier_shifts")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        actual_cash,
        expected_cash,
        difference,
        total_sales,
        total_cash,
        total_qris,
        total_other,
        total_transactions,
        total_expenses,
        notes: data.notes?.trim() || null,
      })
      .eq("id", data.shift_id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true, totals: { opening_cash, total_sales, total_cash, total_qris, total_other, total_transactions, total_expenses, expected_cash, actual_cash, difference } };
  });

export const listShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tenantId = await getTenantId(context);
    const { data, error } = await context.supabase
      .from("cashier_shifts")
      .select("*, cashiers(name)")
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });
