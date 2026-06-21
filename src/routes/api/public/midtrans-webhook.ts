import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

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
          .select("id, tenant_id")
          .eq("midtrans_order_id", order_id)
          .maybeSingle();
        if (!pay) return new Response("order not found", { status: 404 });

        let newStatus: "pending" | "paid" | "failed" | "expired" = "pending";
        if (transaction_status === "capture" || transaction_status === "settlement") newStatus = "paid";
        else if (transaction_status === "deny" || transaction_status === "cancel" || transaction_status === "failure") newStatus = "failed";
        else if (transaction_status === "expire") newStatus = "expired";

        await supabaseAdmin
          .from("payments")
          .update({
            status: newStatus,
            payment_type,
            midtrans_transaction_id: transaction_id,
            paid_at: newStatus === "paid" ? new Date().toISOString() : null,
            raw_response: body,
          })
          .eq("id", pay.id);

        if (newStatus === "paid") {
          // Extend subscription by 30 days from current period end (or now if expired)
          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("current_period_end")
            .eq("tenant_id", pay.tenant_id)
            .maybeSingle();
          const base = sub && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
          const next = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active", current_period_end: next.toISOString() })
            .eq("tenant_id", pay.tenant_id);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
