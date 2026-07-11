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

// ============================================================
// Invoice / Receipt scan for Purchase Orders
// ============================================================

const InvoiceInput = z.object({
  images: z.array(z.object({ data_url: z.string().min(20) })).min(1).max(4),
  existing_products: z.array(z.object({
    id: z.string(),
    name: z.string(),
    barcode: z.string().nullable().optional(),
    code: z.string().optional(),
  })).default([]),
  existing_categories: z.array(z.string()).default([]),
  store_type: z.enum(["auto", "warung", "grosiran", "both"]).default("auto"),
});

const InvoiceItem = z.object({
  name: z.string(),
  barcode: z.string().nullable().optional(),
  category: z.string().nullable().optional().describe("Kategori produk (mis. Sembako, Rokok, Snack). Pilih dari kategori existing jika cocok, atau usulkan baru singkat 1-2 kata."),
  qty: z.number().min(1).default(1),
  cost_price: z.number().min(0).describe("Harga modal per pcs"),
  sell_price: z.number().min(0).nullable().describe("Rekomendasi harga jual per pcs"),
  matched_product_id: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const InvoiceOutput = z.object({
  supplier: z.string().nullable(),
  invoice_no: z.string().nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  total: z.number().nullable().optional(),
  items: z.array(InvoiceItem).default([]),
  detected_store_type: z.enum(["warung", "grosiran", "both"]).nullable().optional(),
});


export type AiInvoiceResult = z.infer<typeof InvoiceOutput>;

function invoicePrompt(existing: { id: string; name: string; barcode?: string | null }[], existingCategories: string[], storeType: "auto" | "warung" | "grosiran" | "both") {
  const guide = storeTypeGuidance(storeType);
  const list = existing.slice(0, 200).map((p) => `- ${p.id} | ${p.name}${p.barcode ? ` | ${p.barcode}` : ""}`).join("\n");
  const cats = existingCategories.length > 0
    ? `Kategori yang sudah ada di toko: ${existingCategories.join(", ")}. Pilih salah satu jika cocok, atau usulkan baru singkat 1-2 kata.`
    : "Belum ada kategori. Usulkan singkat 1-2 kata (mis. Sembako, Rokok, Snack, Minuman, Sabun).";
  return `Anda asisten kasir warung & grosir Indonesia. Tugas: baca foto STRUK / FAKTUR pembelian dari supplier dan ekstrak data terstruktur untuk membuat Purchase Order otomatis.

${guide}

Aturan:
1. supplier: nama toko/distributor di kepala struk (mis. "Toko Sumber Rejeki", "PT Indomarco", "CV Berkah").
2. invoice_no & invoice_date jika terlihat (tanggal YYYY-MM-DD).
3. items: 1 baris struk = 1 item. Field:
   - name: nama barang seperti tertulis (gabung brand+varian+ukuran bila ada).
   - barcode: jika ada angka EAN di baris, isi.
   - category: tebak kategori barang. ${cats}
   - qty: jumlah pcs DASAR. Jika baris tertulis "2 DUS @20pcs", qty=40 (kalikan).
   - cost_price: HARGA MODAL PER PCS. Jika struk tampil total per baris, hitung (subtotal / qty). Jika tampil per dus, BAGI dengan isi dus.
   - sell_price: REKOMENDASI HARGA JUAL per pcs sesuai mode toko (warung: cost+margin 10-20% bulat 500/1000; grosir: cost+500-1000; both: pakai eceran).
   - matched_product_id: jika nama/barcode COCOK dengan salah satu produk existing di bawah, isi UUID-nya. Selain itu null.
4. total: total faktur jika terbaca.

Produk existing di toko (untuk matching):
${list || "(belum ada)"}

Output JSON sesuai schema, tanpa markdown fence.`;
}


export const analyzeInvoicePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InvoiceInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY belum di-set");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const userContent: any[] = [
      { type: "text", text: "Berikut foto struk/faktur. Ekstrak supplier + semua item ke JSON." },
    ];
    for (const img of data.images) {
      userContent.push({ type: "image", image: img.data_url });
    }

    try {
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: invoicePrompt(data.existing_products, data.existing_categories, data.store_type) + "\n\nReturn ONLY one JSON object: { supplier, invoice_no?, invoice_date?, total?, detected_store_type?, items:[{name,barcode?,category?,qty,cost_price,sell_price,matched_product_id?,note?}] }" },
          { role: "user", content: userContent },
        ],

      });
      const json = extractJson(text);
      const parsed = InvoiceOutput.safeParse(json);
      if (!parsed.success) {
        console.error("AI invoice parse error", parsed.error.flatten(), "raw:", text);
        throw new Error("AI mengembalikan format tidak valid. Foto struk lebih jelas dan tidak terpotong.");
      }
      return parsed.data;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("429") || /rate.?limit/i.test(msg)) throw new Error("Terlalu banyak permintaan AI. Coba lagi sebentar.");
      if (msg.includes("402") || /credit/i.test(msg)) throw new Error("Kredit AI habis. Hubungi admin / top-up workspace.");
      throw new Error("Gagal menganalisa struk: " + msg);
    }
  });

// ============================================================
// Customer Order parsing (Kasir AI)
// ============================================================

const OrderInput = z.object({
  text: z.string().optional().default(""),
  images: z.array(z.object({ data_url: z.string().min(20) })).max(3).optional().default([]),
  products: z.array(z.object({
    id: z.string(),
    name: z.string(),
    barcode: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    units: z.array(z.string()).default([]),
  })).max(800).default([]),
});

const OrderItem = z.object({
  raw: z.string().describe("Tulisan asli pelanggan"),
  matched_product_id: z.string().nullable(),
  matched_name: z.string().nullable(),
  qty: z.number().min(1).default(1),
  unit: z.string().nullable().describe("Nama satuan: pcs/bungkus/dus/slove dll bila disebut"),
  confidence: z.number().min(0).max(1).default(0.5),
  note: z.string().nullable().optional().describe("Catatan: tidak ditemukan / ambigu / alternatif"),
});

const OrderOutput = z.object({
  items: z.array(OrderItem).default([]),
  summary: z.string().nullable().optional(),
});

export type AiOrderResult = z.infer<typeof OrderOutput>;

export const analyzeCustomerOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrderInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY belum di-set");
    if (!data.text.trim() && data.images.length === 0) throw new Error("Masukkan teks atau foto pesanan.");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const list = data.products.slice(0, 800).map((p) => {
      const u = p.units && p.units.length ? ` | satuan: ${p.units.join(",")}` : "";
      const bc = p.barcode ? ` | bc:${p.barcode}` : "";
      return `- ${p.id} | ${p.name}${bc}${u}`;
    }).join("\n");

    const system = `Anda asisten kasir warung Indonesia. Pelanggan menulis daftar belanja (mis. di kertas, chat, atau lisan). Tugas Anda: cocokkan setiap item ke katalog produk toko.

Aturan:
1. Pahami singkatan & ejaan Indonesia: "indomi" = indomie, "rokok sm" = Sampoerna Mild, "aqua btl" = Aqua botol, "telor 1 kg", "minyak 1 lt", "bras 5 kg" = beras, "gulpas" = gula pasir, "kpi" = kopi.
2. qty: angka yang ditulis pelanggan. Jika tidak disebut → 1.
3. unit: jika pelanggan menyebut "1 dus indomie" / "2 slove rokok" / "3 botol" → isi unit dengan nama satuan persis seperti yang ada di "satuan" produk (case-insensitive). Jika tidak disebut, biarkan null (pakai eceran).
4. matched_product_id: HARUS UUID dari daftar di bawah. Pilih yang paling cocok. Jika ragu antara beberapa varian (mis. "indomie" tanpa rasa), pilih yang paling umum dan isi note "ambigu, default goreng" atau sejenis.
5. Jika benar-benar tidak ada di katalog → matched_product_id=null, matched_name=null, note="tidak ada di stok".
6. confidence: 0.9+ kalau persis, 0.6-0.8 kalau perlu tebakan, <0.5 kalau ragu.
7. summary: 1 kalimat ringkas (mis. "8 item, 1 tidak ditemukan").

Katalog produk (id | nama | barcode | satuan):
${list || "(kosong)"}

Return ONLY JSON: { items:[{raw,matched_product_id,matched_name,qty,unit,confidence,note?}], summary? }`;

    const userContent: any[] = [];
    if (data.text.trim()) userContent.push({ type: "text", text: `Daftar pesanan pelanggan:\n${data.text}` });
    for (const img of data.images) userContent.push({ type: "image", image: img.data_url });
    if (userContent.length === 0) userContent.push({ type: "text", text: "(kosong)" });

    try {
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      });
      const json = extractJson(text);
      const parsed = OrderOutput.safeParse(json);
      if (!parsed.success) {
        console.error("AI order parse error", parsed.error.flatten(), "raw:", text);
        throw new Error("AI mengembalikan format tidak valid.");
      }
      return parsed.data;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("429") || /rate.?limit/i.test(msg)) throw new Error("Terlalu banyak permintaan AI. Coba lagi sebentar.");
      if (msg.includes("402") || /credit/i.test(msg)) throw new Error("Kredit AI habis. Hubungi admin / top-up workspace.");
      throw new Error("Gagal menganalisa pesanan: " + msg);
    }
  });


