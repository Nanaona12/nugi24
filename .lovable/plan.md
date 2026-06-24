
## Yang akan dibangun

### 1. Akun karyawan/kasir berbasis PIN (1 tenant, banyak kasir)

- Menu baru **Karyawan** (khusus pemilik) untuk menambah / mengubah / menonaktifkan kasir. Tiap kasir punya: Nama, PIN 4–6 digit, status aktif.
- Saat masuk halaman **Kasir**, muncul layar kunci "Pilih Kasir → Masukkan PIN". Sebelum PIN benar, transaksi tidak bisa dibuka.
- Setelah kasir terpilih, namanya tampil di header kasir. Tombol **Ganti Kasir** mengunci ulang layar tanpa logout pemilik.
- Hak akses (UI-level, karena sesi tetap milik pemilik di perangkat toko): kasir hanya bisa pakai menu Kasir & lihat Produk. Menu Keuntungan, Karyawan, Langganan, Pengaturan, Pengambilan, dll. disembunyikan saat sedang dalam mode kasir aktif.
- PIN disimpan sebagai hash (bukan teks polos) supaya tidak bisa dilihat dari database.

### 2. Closing kasir (lengkap)

- Setiap sesi kasir = **shift**. Saat kasir login PIN pertama kali hari itu, muncul **Buka Shift**: input saldo awal kas (uang receh di laci).
- Selama shift, semua transaksi otomatis terikat ke shift tsb (kasir + waktu buka).
- Tombol **Pengeluaran Shift** untuk catat pengeluaran kecil (beli kresek, bayar tukang dll): label + nominal. Tampil di ringkasan closing.
- Tombol **Closing Shift** membuka dialog dengan ringkasan otomatis:
  - Saldo awal kas
  - Total penjualan tunai, QRIS, total transaksi
  - Total pengeluaran shift
  - **Kas seharusnya** = saldo awal + penjualan tunai − pengeluaran
  - Input **Fisik akhir kas** (kasir hitung uang di laci) → sistem hitung **Selisih** otomatis (lebih / kurang / pas), warna hijau / merah.
  - Catatan opsional.
- Setelah dikonfirmasi: shift ditutup, kasir wajib PIN lagi untuk shift baru, dan muncul **Struk Closing** yang bisa di-print / disimpan PNG (format mirip struk kasir yang sudah ada).
- Menu baru **Riwayat Shift** (pemilik) untuk lihat closing-closing sebelumnya per kasir.

### 3. Badge kadaluarsa di kartu produk kasir

- Kasir memuat ringkasan batch per produk (yang sudah ada datanya di tabel `product_batches`).
- Kartu produk di kasir menampilkan badge kecil di pojok:
  - Hitam "Expired" jika ada batch sudah lewat
  - Merah "≤30h" jika batch terdekat ≤ 30 hari
  - Kuning "≤90h" jika ≤ 90 hari
  - Tidak ada badge jika > 90 hari atau tanpa data batch
- Tooltip badge menampilkan tanggal & jumlah unit batch terdekat. Tidak memblokir penjualan (sesuai pilihan).

---

## Detail teknis (untuk referensi)

### Database (migration)

- `cashiers` (id, tenant_id, name, pin_hash, active, created_at, updated_at) — RLS: hanya pemilik tenant yang bisa baca/tulis.
- `cashier_shifts` (id, tenant_id, cashier_id, opened_at, closed_at, opening_cash, expected_cash, actual_cash, difference, total_sales, total_cash, total_qris, total_other, total_transactions, total_expenses, notes, status: 'open'|'closed').
- `shift_expenses` (id, tenant_id, shift_id, label, amount, created_at).
- Tambah kolom ke `transactions`: `cashier_id` (nullable), `shift_id` (nullable). Kolom lama tidak terpengaruh — transaksi lama tetap bisa dibaca.
- RLS semua tabel baru: hanya pemilik tenant via `tenant_id = current_tenant_id()`.
- Index: `cashier_shifts(tenant_id, status)` untuk lookup shift aktif, `transactions(shift_id)` untuk agregasi closing.

### Halaman & komponen

- `src/routes/_authenticated/karyawan.tsx` — CRUD kasir, set/reset PIN.
- `src/routes/_authenticated/shift.tsx` — riwayat shift (pemilik), bisa lihat detail per shift.
- `src/components/CashierLock.tsx` — overlay PIN di kasir; juga handle dialog "Buka Shift".
- `src/components/ShiftCloseDialog.tsx` — dialog closing + render struk closing PNG (reuse pola dari `renderReceiptPng`).
- Update `src/routes/_authenticated/kasir.tsx`:
  - Wrap halaman dgn cek shift aktif; kalau belum, tampilkan CashierLock.
  - Header tampil: Kasir aktif + tombol "Pengeluaran", "Closing", "Ganti Kasir".
  - Saat insert `transactions`, isi `cashier_id` & `shift_id`.
  - Muat ringkasan `product_batches` → badge di kartu produk.
- Update `src/routes/_authenticated/route.tsx` sidebar: tambah "Karyawan" & "Riwayat Shift" (pemilik). Saat ada shift kasir aktif & user dlm mode kasir, sembunyikan menu non-kasir.

### PIN hashing

- Hash di server pakai `createServerFn` + `crypto.subtle` (PBKDF2-SHA256, 100k iter, salt random per kasir). Verifikasi PIN juga di server function (constant-time compare). PIN tidak pernah keluar dari server, hanya `true/false` ke client.

### Yang TIDAK dibangun (di luar scope ini)

- Login email terpisah per karyawan / RLS multi-user-per-tenant. (Bisa ditambah kemudian kalau perlu HP karyawan masing-masing.)
- Cetak struk closing ke printer thermal hardware-level. Yang dibangun: gambar PNG yg bisa di-print browser.
- Batasan RLS untuk mencegah kasir bypass UI (karena sesi memang milik pemilik di perangkat toko).
