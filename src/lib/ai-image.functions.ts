import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  source_url: z.string().url(),
});

export const generateWhiteBgProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY belum diset");

    // Ambil foto sumber. Bucket product-photos bersifat privat, jadi utamakan
    // download lewat Storage API (pakai sesi user) sebelum fallback ke fetch URL.
    const marker = "/product-photos/";
    const idx = data.source_url.indexOf(marker);
    let bytesIn: Uint8Array | null = null;
    let contentType = "image/jpeg";
    if (idx !== -1) {
      let path = data.source_url.slice(idx + marker.length).split("?")[0];
      try { path = decodeURIComponent(path); } catch { /* keep raw */ }
      const { data: blob, error: dlErr } = await context.supabase.storage.from("product-photos").download(path);
      if (!dlErr && blob) {
        contentType = blob.type || contentType;
        bytesIn = new Uint8Array(await blob.arrayBuffer());
      }
    }
    if (!bytesIn) {
      const imgRes = await fetch(data.source_url);
      if (!imgRes.ok) throw new Error("Gagal mengambil foto sumber");
      contentType = imgRes.headers.get("content-type") || contentType;
      bytesIn = new Uint8Array(await imgRes.arrayBuffer());
    }
    let bin = "";
    for (let i = 0; i < bytesIn.byteLength; i++) bin += String.fromCharCode(bytesIn[i]);
    const srcB64 = btoa(bin);
    const srcDataUrl = `data:${contentType};base64,${srcB64}`;


    const prompt =
      "Edit foto produk ini menjadi versi katalog e-commerce yang bersih: ganti latar belakang menjadi PUTIH POLOS (#FFFFFF) tanpa tekstur, tanpa bayangan tajam, tanpa properti tambahan. Pertahankan produk (bentuk, warna, label, teks kemasan) tetap utuh dan tajam, posisikan di tengah, cahaya rata seperti studio produk. Hasilkan gambar persegi berkualitas tinggi.";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: srcDataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) throw new Error("Rate limit AI. Coba lagi sebentar.");
      if (aiRes.status === 402) throw new Error("Kredit AI habis. Isi ulang di Settings.");
      throw new Error(`AI gagal (${aiRes.status}): ${errText.slice(0, 200)}`);
    }
    const json: any = await aiRes.json();
    const b64: string | undefined = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error("AI tidak mengembalikan gambar");

    // Get tenant id for storage path
    const { data: tidData } = await context.supabase.rpc("current_tenant_id");
    const tenantId = tidData as string | null;
    if (!tenantId) throw new Error("Toko tidak ditemukan");

    // Upload PNG to product-photos
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${tenantId}/ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error: upErr } = await context.supabase.storage
      .from("product-photos")
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error("Gagal unggah hasil: " + upErr.message);
    const { data: pub } = context.supabase.storage.from("product-photos").getPublicUrl(path);
    return { url: pub.publicUrl };
  });
