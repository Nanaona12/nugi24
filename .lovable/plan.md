## Tujuan
Menambahkan 2 jenis promo di sistem:
1. **Beli X Gratis Y** — otomatis di kasir, dukung produk sama & produk berbeda.
2. **Cuci Gudang / Jual Rugi** — diskon manual per produk (harga promo + tanggal berakhir), otomatis dipakai di kasir. Selisih rugi tercatat di halaman Keuntungan.

---

## 1. Database (1 migration)

### Tabel baru `public.promos`
Kolom domain: `tenant_id`, `name`, `type` (`bxgy` | `clearance`), `active`, `starts_at`, `ends_at`.

Untuk **Beli X Gratis Y**:
- `buy_product_id`, `buy_qty` (mis. 2)
- `free_product_id` (boleh sama dengan buy, boleh beda), `free_qty` (mis. 1)

Untuk **Cuci Gudang**:
- `clearance_product_id`
- `clearance_price` (harga promo baru)
- (harga normal & modal diambil dari master produk saat kasir)

RLS: owner + cashier session per tenant. Standar GRANT untuk `authenticated` + `service_role`.

### Kolom baru
- `transaction_items.promo_id uuid null` — menandai item mana yang bagian promo (gratis atau diskon).
- `transaction_items.is_free boolean default false` — item hadiah (harga 0).
- `transaction_items.discount_amount numeric default 0` — potongan cuci gudang per baris (utk pencatatan rugi).

### `profit_activity_log`
Tambah jenis baru `promo_loss` (tanpa perubahan skema, kolom `type` sudah text).

---

## 2. Halaman baru: `/promo` (admin only)
File: `src/routes/_authenticated/promo.tsx` + link di sidebar.

- List semua promo, badge status (aktif/expired/nonaktif).
- Tab: **Beli X Gratis Y** dan **Cuci Gudang**.
- Form BXGY: pilih produk beli + qty, pilih produk gratis (bisa produk sama) + qty, tanggal mulai/berakhir.
- Form Cuci Gudang: pilih produk (tampilkan harga normal & modal), input harga promo (warning jika di bawah modal → "Jual Rugi: -Rp X per pcs"), tanggal berakhir.
- Tombol aktif/nonaktif & hapus.

---

## 3. Integrasi Kasir (`src/routes/_authenticated/kasir.tsx`)

### Cuci gudang (harga promo otomatis)
- Saat load produk, join `promos` aktif `type='clearance'` → simpan `clearance_price` per product.
- Kasir menampilkan harga promo dengan coretan harga normal + badge "Cuci Gudang".
- Saat masuk keranjang, harga dipakai = clearance_price; `discount_amount = (harga_normal - clearance_price) * qty` disimpan ke item.

### Beli X Gratis Y (otomatis)
- Setelah keranjang berubah, jalankan `recomputePromos(cart, promos)`:
  - Untuk tiap promo BXGY aktif: hitung `bundles = floor(qty_produk_beli / buy_qty)`, tambahkan `bundles * free_qty` sebagai baris `free_product` dengan `price=0`, `is_free=true`, `promo_id`.
  - Jika `free_product_id === buy_product_id`, tampilkan sebagai baris terpisah (agar jelas "gratis").
- Baris gratis punya badge hijau "GRATIS" dan tidak bisa diedit qty (auto-managed).
- Saat submit transaksi: item gratis ikut tersimpan (harga 0), stok tetap berkurang normal.

### Tampilan
- Preview keranjang + struk: item gratis tercetak "(GRATIS PROMO)" harga 0.
- Cuci gudang: harga coret + harga promo.

---

## 4. Halaman Keuntungan (`src/routes/_authenticated/keuntungan.tsx`)

- Query `transaction_items` dalam range: hitung `totalPromoLoss = sum(discount_amount) + sum(cost_price * qty untuk is_free=true)`.
- Kurangi metrik profit (all / today / month / year) dengan `totalPromoLoss` (pakai pola yang sama seperti shift shortage).
- Tambah kartu "Kerugian Promo" (kuning/oranye) di ringkasan.
- Riwayat aktivitas: entri `promo_loss` (opsional per closing hari; awalnya cukup dihitung on-the-fly dari items, tanpa perlu insert manual).

---

## 5. Struk & Riwayat
- `escpos.ts` / receipt renderer: tampilkan item gratis dengan label "GRATIS" dan diskon cuci gudang dengan format `Rp X → Rp Y`.
- Halaman `riwayat.tsx`: tetap; kolom "Untung" admin otomatis benar karena `discount_amount` & `is_free` sudah masuk perhitungan.

---

## Catatan
- Refund item promo: jika item induk (`buy`) di-refund, baris gratis dihapus juga (trigger di `refund_items` bisa ditambah nanti — untuk V1 kasir yang atur manual saat refund).
- Tidak mengubah alur langganan/paket; fitur promo tersedia untuk semua paket.
- Tidak ada perubahan pada halaman lain (Pembukuan, Dashboard, Hutang).
