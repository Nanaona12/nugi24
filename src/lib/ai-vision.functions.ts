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
});

const KIND_LABEL: Record<string, string> = {
  package: "Foto kemasan/depan produk",
  barcode: "Foto area barcode",
  expiry: "Foto tanggal kadaluarsa (EXP/BBD/Best Before)",
  receipt: "Foto struk/faktur pembelian (untuk harga modal)",
};

function buildPrompt(existingCategories: string[], mode: "full" | "expiry_only") {
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

  return `Anda asisten kasir warung Indonesia. Baca foto kemasan produk FMCG dan ekstrak data terstruktur.

Tugas:
1. Nama produk: gabung brand + varian + ukuran/berat (mis. "Indomie Goreng Original 85g", "Aqua 600ml", "Surya 16 Filter").
2. Kategori: ${cats}
3. Barcode: jika foto barcode terlihat jelas, baca angka di bawahnya (EAN-13 = 13 digit, EAN-8 = 8 digit). Kosongkan jika ragu.
4. Tanggal kadaluarsa: baca semua exp date dari kemasan. Format normalisasi YYYY-MM-DD. Jika hanya bulan+tahun, pakai hari terakhir bulan. Jika ada beberapa exp berbeda, buat 1 entri per tanggal dengan qty.
5. Harga modal (cost): ambil HANYA dari foto struk/faktur jika ada. Jangan tebak. Null jika tidak ada.
6. Harga jual rekomendasi: estimasi harga pasar warung Indonesia untuk produk ini (rupiah, bulatkan ke 500/1000). Sertakan margin_pct dan est_profit_per_pcs (anggap modal = harga jual / (1 + margin/100) jika cost null). Pakai pengetahuan harga umum warung 2024-2026.
7. confidence: 0-1 per field, untuk menandai mana yang perlu diperiksa user.

Reasoning singkat 1 kalimat untuk harga jual (kenapa angka itu).`;
}

const OutputSchema = z.object({
  name: z.string().nullable(),
  category: z.string().nullable(),
  barcode: z.string().nullable(),
  cost_price: z.number().nullable(),
  recommended_price: z.object({
    price: z.number().nullable(),
    margin_pct: z.number().nullable(),
    est_profit_per_pcs: z.number().nullable(),
    reasoning: z.string().nullable(),
  }).nullable(),
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

    const systemPrompt = buildPrompt(data.existing_categories, data.mode);

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
  "cost_price": number | null,
  "recommended_price": { "price": number|null, "margin_pct": number|null, "est_profit_per_pcs": number|null, "reasoning": string|null } | null,
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
