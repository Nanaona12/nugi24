import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeTarget(raw: string) {
  let t = raw.replace(/[^\d]/g, "");
  if (t.startsWith("0")) t = "62" + t.slice(1);
  if (!t.startsWith("62")) t = "62" + t;
  return t;
}

export const sendFonnteWa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      target: z.string().min(8),
      message: z.string().min(1).max(4000),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const token = process.env.FONNTE_TOKEN;
    if (!token) return { ok: false as const, error: "FONNTE_TOKEN tidak dikonfigurasi" };
    const target = normalizeTarget(data.target);
    try {
      const form = new URLSearchParams();
      form.set("target", target);
      form.set("message", data.message);
      form.set("countryCode", "62");
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
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

export const sendFonnteWaImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      target: z.string().min(8),
      caption: z.string().max(4000).optional(),
      filename: z.string().default("struk.png"),
      // base64 (without data URI prefix)
      imageBase64: z.string().min(100),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const token = process.env.FONNTE_TOKEN;
    if (!token) return { ok: false as const, error: "FONNTE_TOKEN tidak dikonfigurasi" };
    const target = normalizeTarget(data.target);
    try {
      const bin = Uint8Array.from(atob(data.imageBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bin], { type: "image/png" });
      const form = new FormData();
      form.set("target", target);
      if (data.caption) form.set("message", data.caption);
      form.set("countryCode", "62");
      form.set("file", blob, data.filename);
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body: form,
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

export const sendFonnteWaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      target: z.string().min(8),
      message: z.string().max(4000).optional(),
      url: z.string().url(),
      filename: z.string().default("struk.png"),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const token = process.env.FONNTE_TOKEN;
    if (!token) return { ok: false as const, error: "FONNTE_TOKEN tidak dikonfigurasi" };
    const target = normalizeTarget(data.target);
    try {
      const form = new URLSearchParams();
      form.set("target", target);
      if (data.message) form.set("message", data.message);
      form.set("url", data.url);
      form.set("filename", data.filename);
      form.set("countryCode", "62");
      const res = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await res.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch {}
      console.log("[fonnte.url] status=", res.status, "url=", data.url, "resp=", text.slice(0, 500));
      if (!res.ok || json?.status === false) {
        return { ok: false as const, error: json?.reason || `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true as const, detail: json };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "Network error" };
    }
  });
