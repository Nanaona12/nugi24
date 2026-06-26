import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getTenantId(ctx: any): Promise<string> {
  const { data: t } = await ctx.supabase
    .from("tenants").select("id").eq("owner_user_id", ctx.userId).maybeSingle();
  if (t) return t.id as string;
  const { data: m } = await ctx.supabase
    .from("tenant_cashier_users").select("tenant_id").eq("user_id", ctx.userId).maybeSingle();
  if (m) return (m as any).tenant_id as string;
  throw new Error("Toko tidak ditemukan");
}

function midtransBase() {
  const key = process.env.MIDTRANS_SERVER_KEY ?? "";
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diatur");
  const isProd = !key.startsWith("SB-Mid-server-");
  return {
    key,
    auth: Buffer.from(key + ":").toString("base64"),
    base: isProd ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
    isProd,
  };
}

/** Create a dynamic QRIS charge via Midtrans Core API. */
export const createCashierQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { amount: number; shift_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const amount = Math.max(1, Math.round(Number(data.amount) || 0));
    if (amount <= 0) throw new Error("Nominal tidak valid");
    const tenantId = await getTenantId(context);
    const { base, auth } = midtransBase();

    const orderId = `KSR-${tenantId.slice(0, 8)}-${Date.now()}`;
    const res = await fetch(`${base}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: orderId, gross_amount: amount },
        qris: { acquirer: "gopay" },
      }),
    });
    const json: any = await res.json();
    if (!res.ok || (json.status_code && json.status_code >= "400")) {
      const raw = json.status_message || json.error_messages?.join(", ") || "Gagal membuat QRIS";
      const isChannelOff = /payment channel is not activated/i.test(raw);
      throw new Error(
        isChannelOff
          ? "QRIS belum aktif di akun Midtrans Anda. Buka dashboard Midtrans → Settings → Payment Methods → aktifkan QRIS. Jika server key masih sandbox (SB-Mid-server-…), QRIS sandbox hanya bisa diuji via Simulator Midtrans; untuk produksi gunakan server key Live dari akun yang sudah Go-Live."
          : raw,
      );
    }
    const qrUrl: string | null =
      (json.actions ?? []).find((a: any) => a.name === "generate-qr-code")?.url ?? null;
    if (!qrUrl) throw new Error("QR code tidak diterima dari Midtrans");

    return {
      order_id: orderId,
      qr_url: qrUrl,
      amount,
      expiry: json.expiry_time ?? null,
    };
  });

/** Poll QRIS payment status. Returns "pending" | "paid" | "expired" | "failed". */
export const checkCashierQrisStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => d)
  .handler(async ({ data }) => {
    const { base, auth } = midtransBase();
    const res = await fetch(`${base}/v2/${encodeURIComponent(data.order_id)}/status`, {
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    });
    const json: any = await res.json();
    const ts: string = json.transaction_status ?? "";
    let status: "pending" | "paid" | "expired" | "failed" = "pending";
    if (ts === "settlement" || ts === "capture") status = "paid";
    else if (ts === "expire") status = "expired";
    else if (ts === "deny" || ts === "cancel" || ts === "failure") status = "failed";
    return { status, raw_status: ts || null };
  });

/** Cancel a pending QRIS order (best-effort). */
export const cancelCashierQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => d)
  .handler(async ({ data }) => {
    const { base, auth } = midtransBase();
    await fetch(`${base}/v2/${encodeURIComponent(data.order_id)}/cancel`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Basic ${auth}` },
    }).catch(() => {});
    return { ok: true };
  });
