## Tujuan

Tambahkan tombol "Foto AI" di 3 lokasi (Tambah Produk, Tambah Item PO, Tambah Batch Kadaluarsa). User foto kemasan + barcode + (opsional) struk modal → AI baca → form ter-prefill → user review & simpan.

## Alur User

1. Klik tombol kamera "Isi otomatis dengan AI" di dialog.
2. Ambil 1–3 foto: kemasan depan, area barcode, dan opsional tanggal kadaluarsa / struk modal.
3. Tekan "Analisa Foto" → loading 5–10 detik.
4. Form ter-prefill (nama, kategori, barcode, harga modal, harga jual rekomendasi, batch exp + qty). Kolom yang AI tidak yakin ditandai badge kuning "Periksa".
5. User edit jika perlu, klik "Simpan".

## Data yang Diekstrak AI

- **Nama produk** (dari teks kemasan, brand+varian+ukuran).
- **Kategori** (dipilih dari kategori existing tenant, fallback "Lainnya").
- **Barcode** (decode dari foto barcode pakai library client-side ZXing; AI hanya cadangan jika ZXing gagal baca angkanya).
- **Tanggal kadaluarsa + jumlah pcs** (multi-batch — array `{expiry_date, qty}` jika ada beberapa kemasan dengan exp berbeda).
- **Harga modal** (dari foto struk/faktur jika dilampirkan; kosong kalau tidak ada).
- **Harga jual rekomendasi**: AI estimasi harga pasar warung Indonesia + margin wajar per kategori, mengembalikan `{price, margin_pct, est_profit_per_pcs, reasoning_singkat}`.

## Arsitektur Teknis

### Server function baru
`src/lib/ai-vision.functions.ts` — `analyzeProductPhotos`:
- Input: `{ images: Array<{ data_url: string, kind: "package" | "barcode" | "expiry" | "receipt" }>, existing_categories: string[] }`
- Pakai Lovable AI Gateway dengan model `google/gemini-2.5-flash` (multimodal, murah, cukup untuk OCR/baca kemasan).
- Pakai AI SDK `generateText` + `Output.object()` dengan Zod schema untuk struktur respons yang dijamin valid.
- Prompt sistem dalam Bahasa Indonesia: instruksi baca kemasan FMCG warung, format tanggal `DD-MM-YYYY` atau `MM-YYYY` (handle keduanya), estimasi harga pasar berdasarkan brand+ukuran yang dikenali.
- Helper provider Lovable AI di `src/lib/ai-gateway.server.ts` (sesuai pola `ai-sdk-lovable-gateway`).
- Handle error 402/429 → lempar pesan jelas ke UI.

### Komponen UI baru
`src/components/AIPhotoCapture.tsx`:
- Dialog dengan slot 4 foto (Kemasan, Barcode, Exp Date, Struk Modal).
- Tiap slot punya tombol "Ambil Foto" (input `capture="environment"`) atau "Pilih File".
- Preview thumbnail + tombol hapus.
- Resize gambar di client ke max 1280px sebelum kirim (jaga ukuran payload + biaya token).
- Tombol "Analisa" memanggil `analyzeProductPhotos` lalu callback `onResult(parsed)` ke parent.
- Status: idle / capturing / analyzing / done / error.

### Integrasi ke halaman

1. **`src/routes/_authenticated/produk.tsx`** — di dialog "Tambah Produk":
   - Tombol "📷 Isi otomatis dengan AI" di atas form.
   - Hasil prefill ke field nama, kategori, barcode, harga modal, harga jual (tier pcs pertama), dan batch kadaluarsa list.
   - Field yang AI tidak yakin diberi badge "Periksa".

2. **`src/routes/_authenticated/po.tsx`** — di dialog "Tambah Item PO":
   - Sama, tetapi fokus prefill: nama produk (search ke existing dulu, kalau ada → pilih; kalau tidak → suggest "Buat produk baru"), qty, harga modal, batch exp.

3. **Halaman Kadaluarsa (`kadaluarsa.tsx`)** — di form "Tambah Batch":
   - Tombol "📷 Scan exp date" — output langsung array `{expiry_date, qty}` tanpa data produk.

### Rekomendasi Harga

- Tampilkan card kecil di bawah field harga jual: `Rekomendasi: Rp 4.500 (margin 18%, untung ±Rp 700/pcs)` + tombol "Pakai".
- Disclaimer kecil: "Estimasi AI, sesuaikan dengan harga toko Anda."

## Catatan Teknis Tambahan

- Tidak perlu skema DB baru — semua field sudah ada (products, product_batches).
- `src/start.ts` sudah punya `attachSupabaseAuth` middleware → server fn pakai `requireSupabaseAuth` untuk billing/limit awareness.
- ZXing sudah terpasang (`BarcodeScanner.tsx`) → reuse `BrowserMultiFormatReader.decodeFromImageUrl` di client untuk decode barcode dari foto sebelum kirim ke AI (lebih akurat & murah).
- Tanggal expired format Indonesia bervariasi (`EXP 22/07/26`, `BBD 07-2027`, `BEST BEFORE JUL 2026`) → minta AI normalisasi ke ISO `YYYY-MM-DD`; jika hanya bulan+tahun, set ke akhir bulan.
- Tambahkan feature gate sederhana: fitur AI Photo hanya untuk paket Grosiran (sesuai pola plan gating existing) — biar konsisten dengan upselling.

## Yang TIDAK dikerjakan

- Tidak otomatis simpan tanpa konfirmasi user.
- Tidak ada riwayat panggilan AI (bisa ditambah belakangan jika perlu).
- Tidak training model — pakai gemini flash apa adanya.
