import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ---------- PBKDF2 (mirror of cashier.functions.ts) ----------
const ITER = 100_000;
const KEY_BITS = 256;
function fromB64(b64: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function toB64(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
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

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return "K" + s; // ensure starts with letter
}

function normalizeCode(c: string) {
  return (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

// Lazy-ensure the shared cashier auth user exists for this tenant.
// Returns { code, email, password } — only for owner internal use.
async function ensureCashierUser(tenantId: string): Promise<{ code: string; user_id: string; email: string; password: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: t, error } = await supabaseAdmin
    .from("tenants")
    .select("id, cashier_code, cashier_auth_user_id, cashier_auth_password")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) throw new Error("Tenant tidak ditemukan");

  let code = (t as any).cashier_code as string | null;
  let userId = (t as any).cashier_auth_user_id as string | null;
  let password = (t as any).cashier_auth_password as string | null;
  const email = `kasir+${tenantId}@nugi24.internal`;

  // Make sure user exists & password is current
  if (!userId || !password) {
    password = randomPassword();
    // Try create; if email exists, fetch existing & update password
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { tenant_id: tenantId, kind: "cashier_session" },
    });
    if (createErr && !/already/i.test(createErr.message)) throw new Error(createErr.message);
    if (created?.user) {
      userId = created.user.id;
    } else {
      // Already exists — locate via listUsers
      let found: string | null = null;
      let page = 1;
      while (!found) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) throw new Error(listErr.message);
        const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
        if (u) { found = u.id; break; }
        if (list.users.length < 200) break;
        page++;
      }
      if (!found) throw new Error("Gagal menemukan akun kasir bersama");
      userId = found;
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(found, { password });
      if (updErr) throw new Error(updErr.message);
    }
    // Persist mapping
    await supabaseAdmin.from("tenant_cashier_users").upsert({ user_id: userId!, tenant_id: tenantId });
  }

  if (!code) {
    // Trigger should have set this; fallback regenerate via random base32
    const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 8; i++) c += alpha[Math.floor(Math.random() * alpha.length)];
    code = c;
  }

  // Persist updates
  await supabaseAdmin
    .from("tenants")
    .update({ cashier_code: code, cashier_auth_user_id: userId, cashier_auth_password: password })
    .eq("id", tenantId);

  return { code, user_id: userId!, email, password: password! };
}

// ---------- Owner: get/regenerate cashier code ----------

export const getMyCashierCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: t, error } = await context.supabase
      .from("tenants")
      .select("id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Hanya pemilik toko yang bisa lihat kode.");
    const info = await ensureCashierUser((t as any).id);
    return { code: info.code };
  });

export const regenerateMyCashierCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: t, error } = await context.supabase
      .from("tenants")
      .select("id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Hanya pemilik toko");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += alpha[Math.floor(Math.random() * alpha.length)];
    const { error: upErr } = await supabaseAdmin
      .from("tenants")
      .update({ cashier_code: code })
      .eq("id", (t as any).id);
    if (upErr) throw new Error(upErr.message);
    return { code };
  });

// ---------- Public cashier sign-in flow ----------

// Step 1: validate code & return cashier list (no auth)
export const listCashiersByCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    const code = normalizeCode(data.code);
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new Error("Kode tidak valid");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("cashier_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Kode toko salah");
    const { data: cs, error: csErr } = await supabaseAdmin
      .from("cashiers")
      .select("id, name")
      .eq("tenant_id", (t as any).id)
      .eq("active", true)
      .order("name");
    if (csErr) throw new Error(csErr.message);
    return { tenant: { id: (t as any).id, name: (t as any).name }, cashiers: (cs ?? []) as { id: string; name: string }[] };
  });

// Step 2: validate PIN, sign in shared user, return session tokens
export const cashierSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; cashier_id: string; pin: string }) => d)
  .handler(async ({ data }) => {
    const code = normalizeCode(data.code);
    if (!/^[A-Z0-9]{6,12}$/.test(code)) throw new Error("Kode tidak valid");
    if (!/^\d{4,6}$/.test(data.pin)) throw new Error("PIN harus 4-6 angka");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("cashier_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Kode toko salah");

    const tenantId = (t as any).id as string;
    const { data: c, error: cErr } = await supabaseAdmin
      .from("cashiers")
      .select("id, name, pin_hash, pin_salt, active")
      .eq("id", data.cashier_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!c || !(c as any).active) throw new Error("Kasir tidak aktif");

    const salt = fromB64((c as any).pin_salt as string);
    const tryHash = await pbkdf2(data.pin, salt);
    if (!timingSafeEqualStr(tryHash, (c as any).pin_hash as string)) {
      throw new Error("PIN salah");
    }

    // Ensure shared auth user
    const info = await ensureCashierUser(tenantId);

    // Sign in with publishable client (no session persistence)
    const signInClient = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: sess, error: sErr } = await signInClient.auth.signInWithPassword({
      email: info.email,
      password: info.password,
    });
    if (sErr || !sess.session) throw new Error("Gagal membuat sesi: " + (sErr?.message ?? "unknown"));

    // Look up any open shift for this cashier
    const { data: openShift } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, opened_at, opening_cash")
      .eq("cashier_id", (c as any).id)
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .maybeSingle();

    return {
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      cashier: { id: (c as any).id, name: (c as any).name },
      tenant: { id: tenantId, name: (t as any).name },
      open_shift: openShift
        ? {
            shift_id: (openShift as any).id,
            opening_cash: Number((openShift as any).opening_cash) || 0,
            opened_at: (openShift as any).opened_at,
          }
        : null,
    };
  });

// Helper: who am I? (used by AuthedLayout to detect cashier session)
export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: owner } = await context.supabase
      .from("tenants")
      .select("id, name")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (owner) return { kind: "owner" as const, tenant: owner };
    const { data: cm } = await context.supabase
      .from("tenant_cashier_users")
      .select("tenant_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (cm) {
      const { data: tn } = await context.supabase
        .from("tenants")
        .select("id, name")
        .eq("id", (cm as any).tenant_id)
        .maybeSingle();
      return { kind: "cashier" as const, tenant: tn ?? { id: (cm as any).tenant_id, name: "Toko" } };
    }
    return { kind: "other" as const, tenant: null };
  });
