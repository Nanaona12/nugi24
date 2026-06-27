import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLANS, priceFor, daysFor, type PlanId, type BillingPeriod } from "@/lib/plans";

type BillingTenant = { id: string; name: string; phone: string | null; address: string | null };

async function getUserRoles(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return data ?? [];
}

async function resolveBillingTenant(
  ctx: { supabase: any; userId: string },
  opts: { createIfMissing?: boolean } = {},
): Promise<{ tenant: BillingTenant | null; isSuperAdmin: boolean }> {
  const roles = await getUserRoles(ctx);
  const isSuperAdmin = roles.some((r: any) => r.role === "super_admin");
  if (isSuperAdmin) return { tenant: null, isSuperAdmin };

  // 1) Normal owner lookup with user's own session (RLS-friendly path).
  const { data: ownerTenant } = await ctx.supabase
    .from("tenants")
    .select("id, name, phone, address")
    .eq("owner_user_id", ctx.userId)
    .maybeSingle();
  if (ownerTenant) return { tenant: ownerTenant as BillingTenant, isSuperAdmin };

  // 2) Cashier/session fallback, used by the app layout and receipt logic too.
  const { data: tenantId } = await ctx.supabase.rpc("current_tenant_id");
  if (tenantId) {
    const { data: tenantByRpc } = await ctx.supabase
      .from("tenants")
      .select("id, name, phone, address")
      .eq("id", tenantId as string)
      .maybeSingle();
    if (tenantByRpc) return { tenant: tenantByRpc as BillingTenant, isSuperAdmin };
  }

  // 3) Robust fallback: this page is for the signed-in owner. If an older account
  // exists without a tenant because the signup trigger failed, create it now.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: adminTenant } = await supabaseAdmin
    .from("tenants")
    .select("id, name, phone, address")
    .eq("owner_user_id", ctx.userId)
    .maybeSingle();
  if (adminTenant) return { tenant: adminTenant as BillingTenant, isSuperAdmin };

  const { data: cashierMap } = await supabaseAdmin
    .from("tenant_cashier_users")
    .select("tenant_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (cashierMap) return { tenant: null, isSuperAdmin };

  if (!opts.createIfMissing) return { tenant: null, isSuperAdmin };

  const { data: authUser, error: userErr } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
  if (userErr || !authUser?.user) return { tenant: null, isSuperAdmin };
  if (authUser.user.user_metadata?.kind === "cashier_session") return { tenant: null, isSuperAdmin };

  const meta = authUser.user.user_metadata ?? {};
  const fallbackName = authUser.user.email?.split("@")[0] || "Toko Saya";
  const shopName = String(meta.shop_name || meta.name || fallbackName).trim() || "Toko Saya";
  const { data: createdTenant, error: createTenantErr } = await supabaseAdmin
    .from("tenants")
    .insert({ owner_user_id: ctx.userId, name: shopName })
    .select("id, name, phone, address")
    .single();
  if (createTenantErr || !createdTenant) throw new Error(createTenantErr?.message ?? "Gagal membuat toko");

  await supabaseAdmin.from("subscriptions").upsert({
    tenant_id: createdTenant.id,
    status: "past_due",
    current_period_end: new Date().toISOString(),
    plan: "warung",
    period: "monthly",
    price_idr: PLANS.warung.monthly,
  }, { onConflict: "tenant_id" });

  return { tenant: createdTenant as BillingTenant, isSuperAdmin };
}

async function ensureSubscription(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existing) return existing;
  const { data: created, error } = await supabaseAdmin
    .from("subscriptions")
    .insert({
      tenant_id: tenantId,
      status: "past_due",
      current_period_end: new Date().toISOString(),
      plan: "warung",
      period: "monthly",
      price_idr: PLANS.warung.monthly,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return created;
}


export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tenant, isSuperAdmin } = await resolveBillingTenant(context, { createIfMissing: true });
    if (!tenant) return { tenant: null, subscription: null, payments: [], isSuperAdmin };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sub, { data: pays }, qrisUsageRes] = await Promise.all([
      ensureSubscription(tenant.id),
      supabaseAdmin.from("payments").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.rpc("tenant_qris_month_usage", { _tenant: tenant.id }),
    ]);

    const clientKey = process.env.MIDTRANS_CLIENT_KEY ?? "";
    return {
      tenant,
      subscription: sub,
      payments: pays ?? [],
      qris_month_usage: Number(qrisUsageRes.data ?? 0),
      isSuperAdmin,
      midtransClientKey: clientKey,
      midtransIsProduction: clientKey ? !clientKey.startsWith("SB-Mid-client-") : false,
    };
  });

export const updateMyTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; phone?: string; address?: string; static_qris_payload?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const patch: any = {
      name: data.name,
      phone: data.phone ?? null,
      address: data.address ?? null,
    };
    if (data.static_qris_payload !== undefined) {
      patch.static_qris_payload = data.static_qris_payload || null;
    }
    const { error } = await context.supabase
      .from("tenants")
      .update(patch)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyStaticQris = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: t } = await context.supabase
      .from("tenants").select("static_qris_payload").eq("owner_user_id", context.userId).maybeSingle();
    return { payload: (t as any)?.static_qris_payload ?? null };
  });

export const setMyStaticQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { payload: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenants")
      .update({ static_qris_payload: data.payload || null })
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createMidtransPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coupon_code?: string; plan?: PlanId; period?: BillingPeriod } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diatur");

    const planId: PlanId = (data.plan === "grosir" || data.plan === "warung") ? data.plan : "warung";
    const requestedPeriod: BillingPeriod = data.period === "yearly" ? "yearly" : "monthly";
    const period: BillingPeriod = PLANS[planId].monthlyOnly ? "monthly" : requestedPeriod;
    const plan = PLANS[planId];
    const basePrice = priceFor(planId, period);
    const extendDays = daysFor(period);

    const { tenant } = await resolveBillingTenant(context, { createIfMissing: true });
    if (!tenant) throw new Error("Toko tidak ditemukan");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validate coupon if provided
    let coupon: any = null;
    let amount = basePrice;
    if (data.coupon_code) {
      const { data: c } = await supabaseAdmin
        .from("coupons").select("*").eq("code", data.coupon_code.trim().toUpperCase()).maybeSingle();
      if (!c) throw new Error("Kode kupon tidak ditemukan");
      if (!c.active) throw new Error("Kupon tidak aktif");
      if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error("Kupon sudah kedaluwarsa");
      if (c.max_uses && c.used_count >= c.max_uses) throw new Error("Kupon sudah habis digunakan");
      coupon = c;
      amount = Math.max(0, Math.round(basePrice * (100 - c.discount_percent) / 100));
    }

    const periodLabel = period === "yearly" ? "Tahunan" : "Bulanan";
    const itemName = `${plan.name} ${periodLabel}${coupon ? ` (Kupon ${coupon.code} -${coupon.discount_percent}%)` : ""}`;

    // 100% discount → activate directly without Midtrans
    if (coupon && amount === 0) {
      const orderId = `FREE-${tenant.id.slice(0, 8)}-${Date.now()}`;
      await supabaseAdmin.from("payments").insert({
        tenant_id: tenant.id, amount: 0, status: "paid",
        payment_type: "coupon_100", midtrans_order_id: orderId,
        paid_at: new Date().toISOString(),
        coupon_id: coupon.id, coupon_code: coupon.code, discount_percent: coupon.discount_percent,
      });
      const { data: sub } = await supabaseAdmin
        .from("subscriptions").select("current_period_end").eq("tenant_id", tenant.id).maybeSingle();
      const base = sub && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
      base.setDate(base.getDate() + extendDays);
      await supabaseAdmin.from("subscriptions").update({
        status: "active", current_period_end: base.toISOString(),
        plan: planId, price_idr: basePrice, period,
      }).eq("tenant_id", tenant.id);
      await supabaseAdmin.from("coupons").update({ used_count: coupon.used_count + 1 }).eq("id", coupon.id);
      return { free: true as const, order_id: orderId };
    }

    const orderId = `SUB-${tenant.id.slice(0, 8)}-${Date.now()}`;
    await supabaseAdmin.from("payments").insert({
      tenant_id: tenant.id,
      amount,
      status: "pending",
      midtrans_order_id: orderId,
      coupon_id: coupon?.id ?? null,
      coupon_code: coupon?.code ?? null,
      discount_percent: coupon?.discount_percent ?? null,
      raw_response: { plan: planId, period, base_price: basePrice },
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
        transaction_details: { order_id: orderId, gross_amount: amount },
        item_details: [
          { id: `sub-${planId}-${period}`, price: amount, quantity: 1, name: itemName },
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
      .update({ snap_token: json.token, raw_response: { plan: planId, period, base_price: basePrice, midtrans: json } })
      .eq("midtrans_order_id", orderId);

    return {
      token: json.token as string,
      redirect_url: json.redirect_url as string,
      order_id: orderId,
      is_production: isProd,
      plan: planId,
      period,
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
      .select("id, name, phone, address, owner_user_id, created_at, subscriptions(status, current_period_end, plan, period)")
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

export const adminSetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id: string; plan: PlanId; note?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.plan !== "warung" && data.plan !== "grosir") throw new Error("Paket tidak valid");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("subscriptions")
      .select("plan, period")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ plan: data.plan })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);

    if ((prev?.plan ?? null) !== data.plan) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      await supabaseAdmin.from("plan_change_audit").insert({
        tenant_id: data.tenant_id,
        changed_by: context.userId,
        changed_by_email: u?.user?.email ?? null,
        source: "admin",
        old_plan: prev?.plan ?? null,
        new_plan: data.plan,
        old_period: prev?.period ?? null,
        new_period: prev?.period ?? null,
        note: data.note ?? null,
      });
    }
    return { ok: true };
  });

export const listPlanAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tenant_id?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let tenantId = data.tenant_id ?? null;
    if (!isSuper) {
      const { data: own } = await supabaseAdmin
        .from("tenants").select("id").eq("owner_user_id", context.userId).maybeSingle();
      if (!own) return [];
      tenantId = own.id;
    }

    let q = supabaseAdmin
      .from("plan_change_audit")
      .select("id, tenant_id, changed_by_email, source, old_plan, new_plan, old_period, new_period, note, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    if (isSuper && !data.tenant_id) {
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.tenant_id)));
      if (ids.length) {
        const { data: ts } = await supabaseAdmin.from("tenants").select("id, name").in("id", ids);
        const map = new Map((ts ?? []).map((t: any) => [t.id, t.name]));
        return (rows ?? []).map((r: any) => ({ ...r, tenant_name: map.get(r.tenant_id) ?? null }));
      }
    }
    return rows ?? [];
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

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("coupons").select("*").order("created_at", { ascending: false });
    return data ?? [];
  });

export const adminCreateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; discount_percent: number; max_uses?: number | null; expires_at?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coupons").insert({
      code: data.code.trim().toUpperCase(),
      discount_percent: data.discount_percent,
      max_uses: data.max_uses ?? null,
      expires_at: data.expires_at ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coupons").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

