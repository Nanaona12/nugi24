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

    return {
      tenant,
      subscription: sub,
      payments: pays ?? [],
      isSuperAdmin: (roles ?? []).some((r) => r.role === "super_admin"),
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
      .select("id, name, phone, owner_user_id, created_at, subscriptions(status, current_period_end)")
      .order("created_at", { ascending: false });

    const { data: pays } = await supabaseAdmin
      .from("payments")
      .select("tenant_id, amount, status, paid_at, created_at, payment_type")
      .order("created_at", { ascending: false })
      .limit(100);

    return { tenants: tenants ?? [], recentPayments: pays ?? [] };
  });
