
# Rencana: POS → SaaS B2B Multi-Tenant (Rp 14.900/bulan)

## Ringkasan
Mengubah aplikasi POS single-user ini menjadi SaaS multi-tenant di mana setiap toko (tenant) mendaftar, membayar Rp 14.900/bulan, lalu mendapat akses ke kasir, produk, riwayat, dan laporannya sendiri — terpisah total dari toko lain.

## 1. Multi-Tenancy (Pemisahan Data per Toko)

Saat ini semua tabel (`products`, `transactions`, `purchase_orders`, dst.) dipakai bersama tanpa pemisahan toko.

Perubahan database:
- Tabel baru `tenants` (id, nama_toko, owner_user_id, created_at)
- Tabel baru `tenant_members` (tenant_id, user_id, role) — supaya 1 toko bisa punya banyak kasir
- Tambah kolom `tenant_id` di semua tabel data: `products`, `product_units`, `product_price_tiers`, `transactions`, `transaction_items`, `purchase_orders`, `purchase_order_items`
- RLS dirombak: semua policy `auth.uid()` jadi "user harus member dari tenant_id baris ini"
- Function security definer `current_tenant_id()` untuk dipakai di RLS & default value

## 2. Sistem Langganan

Tabel baru:
- `subscriptions` (tenant_id, status: trial/active/past_due/canceled, current_period_end, plan)
- `payments` (tenant_id, amount, status, provider, provider_ref, paid_at)

Akses kasir/produk/dll diblokir kalau `subscription.status` bukan `active` atau `trial` dan `current_period_end < now()`.

## 3. Pembayaran Rp 14.900/bulan

Karena targetnya pasar Indonesia (rupiah, nominal kecil), Stripe/Paddle kurang cocok. Pilihan:

**Opsi A (rekomendasi): Midtrans / Xendit**
- Native rupiah, support QRIS, GoPay, DANA, OVO, ShopeePay, VA bank
- Fee proporsional untuk nominal kecil
- Perlu API key dari user (akan saya minta via secret saat implementasi)
- Webhook untuk auto-activate subscription saat bayar

**Opsi B: Manual transfer + konfirmasi admin**
- Lebih sederhana, tanpa integrasi pihak ketiga
- User transfer ke rekening Anda, lalu Anda approve manual di admin panel
- Cocok untuk MVP / validasi awal

## 4. Halaman Baru

- `/daftar` — signup toko baru (buat user + tenant + trial 7 hari)
- `/langganan` — status langganan, tagihan, tombol bayar/perpanjang
- `/admin` (super-admin only) — lihat semua tenant, approve pembayaran manual, statistik
- Gate: kalau subscription expired → redirect ke `/langganan`

## 5. Onboarding

- Saat signup: otomatis buat tenant + assign user sebagai owner + start trial 7 hari
- Wizard isi nama toko, alamat, nomor WA (untuk header struk)
- Setelah trial habis → wajib bayar untuk lanjut

## Pertanyaan Sebelum Saya Mulai

1. **Metode pembayaran**: Midtrans, Xendit, atau manual transfer dulu (MVP)?
2. **Trial gratis**: berapa hari? (default saran 7 hari)
3. **Multi-user per toko**: 1 toko = 1 user (owner saja), atau owner bisa undang kasir?
4. **Super-admin**: email mana yang jadi super-admin untuk approve & monitoring? (pakai email Anda yang sekarang login?)
5. **Data toko existing**: data produk/transaksi yang sudah ada sekarang dijadikan milik tenant siapa? (atau hapus & mulai bersih?)

## Catatan Teknis (untuk konteks)

- Migration besar — semua tabel dapat kolom `tenant_id NOT NULL`, RLS ditulis ulang
- Helper `current_tenant_id()` SECURITY DEFINER dipakai di RLS untuk hindari rekursi
- Cron harian cek `subscriptions.current_period_end` → ubah ke `past_due`
- Setelah ganti RLS, semua query existing tetap jalan otomatis karena filter di level DB
