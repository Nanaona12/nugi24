import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const ImageInput = z.object({
  data_url: z.string().min(20),
  kind: z.enum(["package", "barcode", "expiry", "receipt"]),
});

const Input = z.object({
  images: z.array(ImageInput).min(1).max(6),
  existing_categories: z.array(z.string()).default([]),
  mode: z.enum(["full", "expiry_only"]).default("full"),
  store_type: z.enum(["auto", "warung", "grosiran", "both"]).default("auto"),
});


const KIND_LABEL: Record<string, string> = {
  package: "Foto kemasan/depan produk",
  barcode: "Foto area barcode",
  expiry: "Foto tanggal kadaluarsa (EXP/BBD/Best Before)",
  receipt: "Foto struk/faktur pembelian (untuk harga modal)",
};

function storeTypeGuidance(storeType: "auto" | "warung" | "grosiran" | "both") {
  if (storeType === "warung") {
    return `MODE TOKO: WARUNG ECERAN.
- Jual per pcs/bungkus dengan margin 10-20% (atau minimal Rp 500-1.500 per pcs).
- suggested_units: 1 satuan saja → "pcs" (atau satuan terkecil yang umum: bungkus, botol, sachet) sebagai base (conversion=1).
- Harga eceran = harga modal per pcs + margin warung, dibulatkan ke 500/1000 terdekat.`;
  }
  if (storeType === "grosiran") {
    return `MODE TOKO: GROSIRAN.
- Margin tipis Rp 500-1.000 per pcs karena volume cepat.
- suggested_units: minimum 2 satuan → base "pcs" (conversion=1) DAN satuan pak (Box/Dus/Slove/Karton) sesuai kemasan terbesar yang terlihat (conversion = isi per pak).
- Harga grosir per pak = (modal per pcs + ~500-1000) × isi pak.`;
  }
  if (storeType === "both") {
    return `MODE TOKO: WARUNG + GROSIRAN.
- WAJIB suggested_units berisi 2 satuan:
  1) base "pcs" (conversion=1) untuk eceran (margin 10-20% / Rp 500-1.500).
  2) satuan pak (Box/Dus/Slove/Karton/Renceng) dengan conversion = isi per pak, harga grosir tipis (markup hanya 500-1000 per pcs).
- Jika foto kemasan menunjukkan box/dus berisi banyak pcs, gunakan jumlah isi itu sebagai conversion.`;
  }
  return `MODE TOKO: AUTO-DETECT.
- Lihat foto: apakah ini kemasan eceran (1 pcs) atau pak besar berisi banyak pcs (box/dus/slove/karton/renceng)?
- Jika hanya 1 pcs → set detected_store_type="warung", suggested_units 1 baris (pcs) margin 10-20%.
- Jika foto menunjukkan box/dus/karton dengan jumlah isi → set "both": base pcs untuk eceran (margin 10-20%) + satuan pak (conversion = isi) untuk grosir (markup tipis 500-1000/pcs).
- Jika konteks jelas grosir saja (struk faktur grosir, kemasan industrial) → "grosiran".`;
}

function buildPrompt(existingCategories: string[], mode: "full" | "expiry_only", storeType: "auto" | "warung" | "grosiran" | "both") {
  const cats = existingCategories.length > 0
    ? `Kategori yang sudah ada di toko: ${existingCategories.join(", ")}. Pilih salah satu jika cocok, atau usulkan kategori baru singkat (1-2 kata).`
    : "Belum ada kategori. Usulkan kategori singkat 1-2 kata (mis. Makanan, Minuman, Rokok, Sabun, Snack).";

  if (mode === "expiry_only") {
    return `Anda asisten yang membaca tanggal kadaluarsa dari foto kemasan produk warung Indonesia.
Tugas: baca SEMUA tanggal kadaluarsa yang terlihat. Format tanggal Indonesia bervariasi:
- "EXP 22/07/26" atau "22-07-26" → 2026-07-22
- "BBD 07/2027" atau "JUL 2027" → akhir bulan = 2027-07-31
- "BEST BEFORE 15 OCT 25" → 2025-10-15

Jika hanya terlihat bulan+tahun, set tanggal ke hari terakhir bulan tsb.
Jika ada beberapa kemasan dengan exp berbeda di foto, buat 1 entri per tanggal dengan qty sesuai jumlah yang terlihat (default 1 jika tidak yakin).

Return JSON sesuai schema. Set confidence rendah jika ragu.`;
  }

  return `Anda asisten kasir warung & grosir Indonesia. Baca foto kemasan / struk dan ekstrak data terstruktur.

${storeTypeGuidance(storeType)}

Tugas:
1. Nama produk: gabung brand + varian + ukuran/berat (mis. "Indomie Goreng Original 85g").
2. Kategori: ${cats}
3. Barcode: jika foto barcode jelas, baca angka di bawahnya (EAN-13/EAN-8). Kosongkan jika ragu.
4. Tanggal kadaluarsa: baca semua exp, normalisasi YYYY-MM-DD (bulan+tahun → hari terakhir bulan).
5. cost_price = HARGA MODAL PER SATUAN DASAR (per pcs). Jika struk hanya menyebut harga per box, BAGI dengan isi box (mis. Rp 16.250 / 20 pcs = Rp 813 per pcs). Null jika tidak ada data.
6. recommended_price: harga jual untuk satuan DASAR (per pcs) sesuai mode toko.
7. suggested_units: array satuan + tiered price siap pakai (lihat panduan mode). Setiap unit punya name, conversion (isi per pak; 1 untuk base), is_base, dan price (harga jual untuk 1 satuan itu). detected_store_type wajib diisi.
8. Reasoning singkat 1 kalimat per rekomendasi harga.
9. confidence per field.

PENTING: untuk grosiran/both, harga unit pak HARUS ≈ (cost per pcs + 500..1000) × conversion. Untuk warung, harga pcs ≈ cost × 1.1..1.2 dibulatkan 500/1000.`;
}

const SuggestedUnit = z.object({
  name: z.string(),
  conversion: z.number().int().min(1),
  is_base: z.boolean(),
  price: z.number().min(0),
  min_qty: z.number().int().min(1).default(1),
  reasoning: z.string().nullable().optional(),
});

const OutputSchema = z.object({
  name: z.string().nullable(),
  category: z.string().nullable(),
  barcode: z.string().nullable(),
  cost_price: z.number().nullable().describe("Modal per satuan DASAR (per pcs)"),
  detected_store_type: z.enum(["warung", "grosiran", "both"]).nullable().default(null),
  recommended_price: z.object({
    price: z.number().nullable(),
    margin_pct: z.number().nullable(),
    est_profit_per_pcs: z.number().nullable(),
    reasoning: z.string().nullable(),
  }).nullable(),
  suggested_units: z.array(SuggestedUnit).default([]),
  expiry_batches: z.array(z.object({
    expiry_date: z.string().describe("YYYY-MM-DD"),
    qty: z.number().int().min(1),
    note: z.string().nullable().optional(),
  })).default([]),
  confidence: z.object({
    name: z.number().min(0).max(1).default(0),
    category: z.number().min(0).max(1).default(0),
    barcode: z.number().min(0).max(1).default(0),
    cost_price: z.number().min(0).max(1).default(0),
    recommended_price: z.number().min(0).max(1).default(0),
    expiry: z.number().min(0).max(1).default(0),
  }).default({ name: 0, category: 0, barcode: 0, cost_price: 0, recommended_price: 0, expiry: 0 }),
});


export type AiVisionResult = z.infer<typeof OutputSchema>;

export const analyzeProductPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY belum di-set");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const systemPrompt = buildPrompt(data.existing_categories, data.mode, data.store_type);

    // Build OpenAI-compatible multimodal content
    const userContent: any[] = [
      { type: "text", text: "Berikut foto-fotonya. Analisa dan kembalikan JSON sesuai schema." },
    ];
    for (const img of data.images) {
      userContent.push({ type: "text", text: `\n[${KIND_LABEL[img.kind] ?? img.kind}]` });
      userContent.push({ type: "image", image: img.data_url });
    }

    try {
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: systemPrompt + "\n\nReturn ONLY a single JSON object matching this TypeScript type, no markdown fences:\n" + schemaHint() },
          { role: "user", content: userContent },
        ],
      });

      const json = extractJson(text);
      const parsed = OutputSchema.safeParse(json);
      if (!parsed.success) {
        console.error("AI vision parse error", parsed.error.flatten(), "raw:", text);
        throw new Error("AI mengembalikan format tidak valid. Coba foto ulang dengan lebih jelas.");
      }
      return parsed.data;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("429") || /rate.?limit/i.test(msg)) {
        throw new Error("Terlalu banyak permintaan AI. Coba lagi sebentar.");
      }
      if (msg.includes("402") || /credit/i.test(msg)) {
        throw new Error("Kredit AI habis. Hubungi admin / top-up workspace.");
      }
      throw new Error("Gagal menganalisa foto: " + msg);
    }
  });

function schemaHint(): string {
  return `{
  "name": string | null,
  "category": string | null,
  "barcode": string | null,
  "cost_price": number | null,  // PER SATUAN DASAR (per pcs)
  "detected_store_type": "warung" | "grosiran" | "both" | null,
  "recommended_price": { "price": number|null, "margin_pct": number|null, "est_profit_per_pcs": number|null, "reasoning": string|null } | null,
  "suggested_units": [ { "name": string, "conversion": number, "is_base": boolean, "price": number, "min_qty": number, "reasoning"?: string } ],
  "expiry_batches": [ { "expiry_date": "YYYY-MM-DD", "qty": number, "note"?: string } ],
  "confidence": { "name": 0-1, "category": 0-1, "barcode": 0-1, "cost_price": 0-1, "recommended_price": 0-1, "expiry": 0-1 }
}`;
}


function extractJson(text: string): any {
  const s = text.trim();
  // Try fenced ```json ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : s;
  try {
    return JSON.parse(candidate);
  } catch {
    // Find first { and last }
    const i = candidate.indexOf("{");
    const j = candidate.lastIndexOf("}");
    if (i >= 0 && j > i) {
      return JSON.parse(candidate.slice(i, j + 1));
    }
    throw new Error("Tidak ada JSON di respons AI");
  }
}
