import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendFonnteWa = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      target: z.string().min(8),
      message: z.string().min(1).max(4000),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const token = process.env.FONNTE_TOKEN;
    if (!token) {
      return { ok: false as const, error: "FONNTE_TOKEN tidak dikonfigurasi" };
    }
    // Normalize Indonesian number to 62xxxx
    let target = data.target.replace(/[^\d]/g, "");
    if (target.startsWith("0")) target = "62" + target.slice(1);
    if (!target.startsWith("62")) target = "62" + target;

    try {
      const form = new URLSearchParams();
      form.set("target", target);
      form.set("message", data.message);
      form.set("countryCode", "62");

      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === false) {
        return { ok: false as const, error: json?.reason || `HTTP ${res.status}` };
      }
      return { ok: true as const, detail: json };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "Network error" };
    }
  });
