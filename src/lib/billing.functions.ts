import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRICE_IDR = 14900;

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, phone, address")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (!tenant) return { tenant: null, subscription: null, payments: [], isSuperAdmin: false };

    const [{ data: sub }, { data: pays }, { data: roles }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("tenant_id", tenant.id).maybeSingle(),
      supabase.from("payments").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const clientKey = process.env.MIDTRANS_CLIENT_KEY ?? "";
    return {
      tenant,
      subscription: sub,
      payments: pays ?? [],
      isSuperAdmin: (roles ?? []).some((r) => r.role === "super_admin"),
      midtransClientKey: clientKey,
      midtransIsProduction: clientKey ? !clientKey.startsWith("SB-Mid-client-") : false,
    };
  });

export const updateMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; phone?: string; address?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenants")
      .update({ name: data.name, phone: data.phone ?? null, address: data.address ?? null })
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createMidtransPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diatur");

    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("id, name")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!tenant) throw new Error("Toko tidak ditemukan");

    const orderId = `SUB-${tenant.id.slice(0, 8)}-${Date.now()}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("payments").insert({
      tenant_id: tenant.id,
      amount: PRICE_IDR,
      status: "pending",
      midtrans_order_id: orderId,
    });

    // Use sandbox by default; switch to https://app.midtrans.com if key is production
    const isProd = !serverKey.startsWith("SB-Mid-server-");
    const base = isProd ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
    const auth = Buffer.from(serverKey + ":").toString("base64");

    const res = await fetch(`${base}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: PRICE_IDR },
        item_details: [
          { id: "sub-basic", price: PRICE_IDR, quantity: 1, name: "Langganan Bulanan Nugi24" },
        ],
        customer_details: { first_name: tenant.name },
      }),
    });
    const json: any = await res.json();
    if (!res.ok || !json.token) {
      console.error("Midtrans error", json);
      throw new Error(json.error_messages?.join(", ") ?? "Gagal membuat transaksi Midtrans");
    }

    await supabaseAdmin
      .from("payments")
      .update({ snap_token: json.token, raw_response: json })
      .eq("midtrans_order_id", orderId);

    return {
      token: json.token as string,
      redirect_url: json.redirect_url as string,
      order_id: orderId,
      is_production: isProd,
    };
  });

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenants } = await supabaseAdmin
      .from("tenants")
      .select("id, name, phone, address, owner_user_id, created_at, subscriptions(status, current_period_end)")
      .order("created_at", { ascending: false });

    const { data: pays } = await supabaseAdmin
      .from("payments")
      .select("tenant_id, amount, status, paid_at, created_at, payment_type")
      .order("created_at", { ascending: false })
      .limit(100);

    return { tenants: tenants ?? [], recentPayments: pays ?? [] };
  });

async function assertSuperAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "super_admin")) throw new Error("Forbidden");
}

export const adminExtendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; days: number }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_end")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();
    const base = sub && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
    base.setDate(base.getDate() + data.days);
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: "active", current_period_end: base.toISOString() })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true, new_end: base.toISOString() };
  });

export const adminSetSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; status: "active" | "trialing" | "past_due" | "canceled" }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ status: data.status })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; name: string; phone?: string; address?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ name: data.name, phone: data.phone ?? null, address: data.address ?? null })
      .eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenants").delete().eq("id", data.tenant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetTenantStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: products }, { count: transactions }, { data: revenueRows }] = await Promise.all([
      supabaseAdmin.from("products").select("*", { count: "exact", head: true }).eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("transactions").select("*", { count: "exact", head: true }).eq("tenant_id", data.tenant_id),
      supabaseAdmin.from("transactions").select("total").eq("tenant_id", data.tenant_id),
    ]);
    const revenue = (revenueRows ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    return { products: products ?? 0, transactions: transactions ?? 0, revenue };
  });

export const adminCreateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; shop_name: string; phone?: string; address?: string; trial_days?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { shop_name: data.shop_name.trim() },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "Gagal membuat user");

    // Wait briefly for trigger to insert tenant/subscription, then update extras.
    let tenantId: string | null = null;
    for (let i = 0; i < 5; i++) {
      const { data: t } = await supabaseAdmin
        .from("tenants").select("id").eq("owner_user_id", created.user.id).maybeSingle();
      if (t) { tenantId = t.id; break; }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!tenantId) throw new Error("Tenant tidak terbuat (trigger gagal)");

    if (data.phone || data.address) {
      await supabaseAdmin.from("tenants").update({
        phone: data.phone ?? null, address: data.address ?? null,
      }).eq("id", tenantId);
    }
    if (typeof data.trial_days === "number" && data.trial_days > 0) {
      const end = new Date(); end.setDate(end.getDate() + data.trial_days);
      await supabaseAdmin.from("subscriptions").update({
        status: "trialing", current_period_end: end.toISOString(),
      }).eq("tenant_id", tenantId);
    }
    return { ok: true, tenant_id: tenantId };
  });

export const adminRecordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; amount: number; payment_type: string; extend_days: number; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orderId = `MAN-${data.tenant_id.slice(0, 8)}-${Date.now()}`;
    const { error: payErr } = await supabaseAdmin.from("payments").insert({
      tenant_id: data.tenant_id,
      amount: data.amount,
      status: "paid",
      payment_type: data.payment_type,
      midtrans_order_id: orderId,
      paid_at: new Date().toISOString(),
      raw_response: { manual: true, note: data.note ?? null, recorded_by: context.userId },
    });
    if (payErr) throw new Error(payErr.message);

    if (data.extend_days > 0) {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions").select("current_period_end").eq("tenant_id", data.tenant_id).maybeSingle();
      const base = sub && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
      base.setDate(base.getDate() + data.extend_days);
      await supabaseAdmin.from("subscriptions").update({
        status: "active", current_period_end: base.toISOString(),
      }).eq("tenant_id", data.tenant_id);
    }
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { new_password: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.new_password || data.new_password.length < 6) throw new Error("Password minimal 6 karakter");
    const { error } = await context.supabase.auth.updateUser({ password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


