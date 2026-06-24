# Login Terpisah: Admin vs Kasir

Saat ini kasir login lewat sesi owner (admin harus masuk dulu). Akan diubah jadi: di halaman login user memilih **Admin** atau **Kasir**. Admin tetap email+password. Kasir cukup masukkan **kode rahasia tenant** → pilih nama kasir → PIN, tanpa owner perlu login.

## Alur Baru

```text
/auth
  ├─ [Card] Saya Admin / Pemilik    → form email + password (existing)
  └─ [Card] Saya Kasir              → 3 langkah:
        1. Input kode rahasia tenant (mis. NUGI-9F3K2A)
        2. Pilih nama kasir (avatar grid)
        3. Input PIN 4-6 digit
                                     → masuk sebagai sesi kasir
```

## Arsitektur Sesi Kasir

Per tenant dibuat **1 shared auth user** otomatis: `kasir+<tenant_id>@nugi24.internal` dengan password acak (disimpan terenkripsi server-side). Saat kasir berhasil verifikasi kode+PIN, server pakai service-role untuk generate session token shared user tsb dan kirim ke client; client memanggil `supabase.auth.setSession()`. RLS tetap aman karena user shared dipetakan ke tenant lewat tabel baru.

### Skema DB (migrasi)

- `tenants` + kolom:
  - `cashier_code text unique` (auto-gen 8 char alfanumerik saat tenant dibuat, owner bisa regen)
  - `cashier_auth_user_id uuid` (referensi ke shared auth user)
- Tabel baru `tenant_cashier_users(tenant_id, user_id)` agar `current_tenant_id()` bisa resolve untuk shared user.
- Update fungsi `current_tenant_id()`:
  ```sql
  SELECT id FROM tenants WHERE owner_user_id = auth.uid()
  UNION
  SELECT tenant_id FROM tenant_cashier_users WHERE user_id = auth.uid()
  LIMIT 1
  ```
- Enum role baru `cashier_session` di `app_role` + insert role utk shared user agar bisa dibedakan dari owner.
- Backfill: untuk tenant yg sudah ada, jalankan migrasi yg mengisi `cashier_code` + buat shared user via trigger first-touch (lazy: dibuat saat owner pertama kali buka menu Pengaturan / pertama kali ada kasir login).

### Server Functions Baru (`src/lib/cashier-auth.functions.ts`)

- `getTenantCashierCode()` — owner only, return kode (lazy generate kalau belum ada + create shared user).
- `regenerateTenantCashierCode()` — owner only.
- `cashierSignIn({ code, cashier_id, pin })` — **publik (tanpa auth)**:
  1. Cari tenant dgn `cashier_code`. Throw kalau salah / rate-limit (5x salah / 5 menit per IP+code).
  2. Validasi PIN kasir di tenant tsb.
  3. Pakai `supabaseAdmin.auth.admin.generateLink` atau set password baru sementara → exchange untuk session. Lebih simpel: simpan password shared user → `signInWithPassword` di server, return `{ access_token, refresh_token }`.
  4. Client panggil `supabase.auth.setSession()` lalu set state `activeCashier` di localStorage.
- `listCashiersByCode({ code })` — publik, return daftar kasir aktif setelah kode valid (untuk langkah 2 di UI).

### Frontend

- `src/routes/auth.tsx`: tambah toggle dua kartu "Admin" / "Kasir". Mode kasir punya 3 step wizard.
- `src/routes/_authenticated/route.tsx`: deteksi role sesi. Kalau `cashier_session`, batasi navigasi.
- `src/components/AppShell.tsx` (sidebar): kalau role kasir, hanya tampil menu **Kasir, Pelanggan, Shift, Riwayat (shift berjalan)**.
- Route gate: kasir akses `/produk`, `/admin`, `/karyawan`, `/keuntungan`, `/po`, `/pengaturan` → redirect ke `/kasir`.
- Halaman `/riwayat` & `/shift`: kalau role kasir, filter otomatis ke `cashier_id` + `shift_id` aktif saja.
- `Pengaturan` (owner): section baru "Kode Login Kasir" — tampilkan kode + tombol "Regenerate" (warning: semua kasir harus pakai kode baru).
- `CashierLock.tsx`: dihapus dari `kasir.tsx` karena login kasir sekarang di halaman auth. Shift open dialog tetap ada (dipanggil saat kasir login & belum ada open shift).
- **Sesi berakhir**: saat tombol "Tutup Shift" sukses → auto `supabase.auth.signOut()` + redirect ke `/auth`. Tombol logout manual tetap tersedia.

### RLS

- Update policy `cashiers`, `transactions`, `transaction_items`, `customers`, `cashier_shifts`, `shift_expenses` agar `current_tenant_id()` versi baru tetap match.
- Untuk role kasir, tambah pembatasan di policy `cashiers` (kasir hanya boleh SELECT, tidak INSERT/UPDATE/DELETE).
- `tenants` SELECT: shared user boleh baca baris tenant-nya saja (read-only kolom non-sensitif via view atau policy kolom — paling simpel: policy allow SELECT, frontend tidak ekspos).

## Yang TIDAK Berubah

- Owner login flow, super admin flow, billing, semua data existing.
- Cara verifikasi PIN, model `cashier_shifts`, dll.

## Catatan Keamanan

- Kode tenant: 8 char base32 (~40 bit). Rate limit di server function untuk cegah brute force.
- Shared user password tidak pernah dikirim ke client; selalu via server function.
- `tenant_cashier_users` tidak boleh ada policy yg expose mapping ke anon.

## Urutan Eksekusi

1. Migrasi DB (kolom + tabel + fungsi + policy + role enum).
2. Server functions baru.
3. Update `auth.tsx` (toggle + wizard kasir).
4. Update route gate + sidebar + auto-logout di close shift.
5. Hapus `CashierLock` dari `kasir.tsx`, sederhanakan jadi cuma "Open Shift dialog".
6. Section kode di Pengaturan.

Estimasi: cukup besar (~300 baris SQL + ~600 baris TS). Lanjut?
