import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { PLANS } from "@/lib/plans";
import { SUBSCRIPTION_ADMIN_WHATSAPP } from "@/lib/subscription-contact";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

async function notifyAdminPayment(details: {
  tenantName: string;
  tenantPhone: string | null;
  orderId: string;
  amount: number;
  planId: "warung" | "grosir";
  period: "monthly" | "yearly";
  paymentType?: string;
}) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.error("FONNTE_TOKEN tidak dikonfigurasi untuk notifikasi langganan");
    return;
  }

  const message = [
    "Pembayaran langganan QRIS berhasil.",
    `Toko: ${details.tenantName}`,
    `WhatsApp toko: ${details.tenantPhone || "-"}`,
    `Order: ${details.orderId}`,
    `Paket: ${PLANS[details.planId].name} (${details.period === "yearly" ? "tahunan" : "bulanan"})`,
    `Jumlah: ${formatRupiah(details.amount)}`,
    `Metode: ${details.paymentType || "QRIS"}`,
    "Paket sudah diaktifkan otomatis oleh sistem.",
  ].join("\n");

  const form = new URLSearchParams({
    target: SUBSCRIPTION_ADMIN_WHATSAPP,
    message,
    countryCode: "62",
  });
  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const responseBody = await response.text();
  if (!response.ok) console.error(`Notifikasi WhatsApp langganan gagal [${response.status}]: ${responseBody}`);
}

export const Route = createFileRoute("/api/public/midtrans-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serverKey = process.env.MIDTRANS_SERVER_KEY;
        if (!serverKey) return new Response("config missing", { status: 500 });

        const body = (await request.json()) as any;
        const { order_id, status_code, gross_amount, signature_key, transaction_status, payment_type, transaction_id } = body;

        // Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
        const expected = createHash("sha512")
          .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
          .digest("hex");
        if (expected !== signature_key) {
          return new Response("invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: pay } = await supabaseAdmin
          .from("payments")
          .select("id, tenant_id, amount, status, raw_response")
          .eq("midtrans_order_id", order_id)
          .maybeSingle();
        if (!pay) return new Response("order not found", { status: 404 });

        let newStatus: "pending" | "paid" | "failed" | "expired" = "pending";
        if (transaction_status === "capture" || transaction_status === "settlement") newStatus = "paid";
        else if (transaction_status === "deny" || transaction_status === "cancel" || transaction_status === "failure") newStatus = "failed";
        else if (transaction_status === "expire") newStatus = "expired";

        // Preserve plan/period metadata stored when the order was created.
        const prevMeta = (pay.raw_response ?? {}) as { plan?: string; period?: string; base_price?: number };
        await supabaseAdmin
          .from("payments")
          .update({
            status: newStatus,
            payment_type,
            midtrans_transaction_id: transaction_id,
            paid_at: newStatus === "paid" ? new Date().toISOString() : null,
            raw_response: { ...prevMeta, webhook: body },
          })
          .eq("id", pay.id);

        const isFirstPaidConfirmation = newStatus === "paid" && pay.status !== "paid";
        if (isFirstPaidConfirmation) {
          const period = prevMeta.period === "yearly" ? "yearly" : "monthly";
          const extendDays = period === "yearly" ? 365 : 30;
          const planId = prevMeta.plan === "grosir" ? "grosir" : "warung";

          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("current_period_end, plan, period")
            .eq("tenant_id", pay.tenant_id)
            .maybeSingle();
          const base = sub && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
          const next = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: "active",
              current_period_end: next.toISOString(),
              plan: planId,
              period,
              price_idr: prevMeta.base_price ?? undefined,
            })
            .eq("tenant_id", pay.tenant_id);

          // Audit log when plan or period actually changes via payment
          if ((sub?.plan ?? null) !== planId || (sub?.period ?? null) !== period) {
            await supabaseAdmin.from("plan_change_audit").insert({
              tenant_id: pay.tenant_id,
              changed_by: null,
              changed_by_email: "midtrans-webhook",
              source: "midtrans",
              old_plan: sub?.plan ?? null,
              new_plan: planId,
              old_period: sub?.period ?? null,
              new_period: period,
              note: `Order ${order_id}`,
            });
          }

          const { data: tenant } = await supabaseAdmin
            .from("tenants")
            .select("name, phone")
            .eq("id", pay.tenant_id)
            .maybeSingle();
          try {
            await notifyAdminPayment({
              tenantName: tenant?.name ?? "Toko",
              tenantPhone: tenant?.phone ?? null,
              orderId: order_id,
              amount: Number(pay.amount ?? gross_amount ?? 0),
              planId,
              period,
              paymentType: payment_type,
            });
          } catch (error) {
            console.error("Notifikasi WhatsApp langganan gagal", error);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
