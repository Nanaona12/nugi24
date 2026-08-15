# Auto Backup ke Google Spreadsheet per Toko

Tujuan: tiap owner toko menghubungkan akun Google-nya sendiri, lalu seluruh data toko itu otomatis tersalin ke satu Google Spreadsheet miliknya — diperbarui harian, plus tombol "Backup Sekarang".

## Yang akan dibuat

### 1. Hubungkan Google (per toko)
- Di halaman **Backup Data** ada kartu baru "Google Spreadsheet".
- Tombol **Hubungkan Google** membuka izin Google (Sheets + Drive). Akses hanya untuk file yang dibuat aplikasi ini.
- Setelah terhubung, tampil: email Google yang dipakai, nama spreadsheet, link buka spreadsheet, tombol **Putuskan**.
- Saat pertama kali terhubung, sistem membuat 1 spreadsheet baru bernama `Backup <Nama Toko>` di Drive owner, lalu menyimpan ID-nya di data toko.
- Owner juga bisa menempelkan link spreadsheet miliknya sendiri jika ingin memakai file yang sudah ada.

### 2. Isi spreadsheet
- Semua 21 tabel yang sekarang ada di unduhan Excel, satu tabel = satu sheet (Produk, Transaksi, Item Transaksi, Hutang, Pembukuan, PO, Batch Modal, Shift, dst.).
- Setiap sinkronisasi menulis ulang isi sheet (baris judul + data terbaru), jadi tidak ada duplikat.
- Hanya data milik toko yang bersangkutan (disaring per tenant).
- Sheet tambahan "Info Backup": waktu backup terakhir, jumlah baris per tabel.

### 3. Jadwal harian + manual
- Tombol **Backup Sekarang ke Spreadsheet** dengan indikator progres per tabel.
- Otomatis harian: backup dijalankan sekali per hari saat aplikasi dibuka oleh owner/kasir (jika hari itu belum ada backup) — ini menjaga backup tetap jalan tanpa perlu server penjadwal.
- Status ditampilkan: "Terakhir backup: 15 Agustus 2026, 07.12" beserta hasil (berhasil/gagal + alasan).
- Riwayat singkat 10 backup terakhir.

### 4. Batasan yang perlu diketahui
- Backup otomatis harian bergantung pada aplikasi dibuka minimal sekali sehari. Kalau toko libur dan aplikasi tidak dibuka, backup hari itu dilewati dan dikejar saat dibuka lagi.
- Bila izin Google dicabut atau kadaluarsa, muncul peringatan di halaman Backup untuk menghubungkan ulang.
- Toko yang sangat besar (puluhan ribu baris transaksi) akan ditulis bertahap agar tidak kena batas Google; jika masih terlalu besar, tabel transaksi dibatasi 12 bulan terakhir.

## Detail teknis

- **Otentikasi**: App User Connector `google_sheets` (OAuth per pengguna aplikasi). Token dikelola connector, tidak disimpan sendiri.
- **Skema DB (migrasi)**: tabel baru `tenant_backup_settings` (tenant_id, spreadsheet_id, spreadsheet_url, google_email, enabled, last_backup_at, last_status, last_error) + tabel `tenant_backup_runs` untuk riwayat. RLS: hanya owner/anggota tenant terkait, plus service_role.
- **Server function** `syncTenantBackup` (`createServerFn` + `requireSupabaseAuth`):
  1. resolve `current_tenant_id()`;
  2. baca semua tabel yang discope tenant (paginasi 1000 baris);
  3. buat spreadsheet bila belum ada (`spreadsheets.create` / `batchUpdate` untuk menambah sheet);
  4. `values.clear` lalu `values.update` per sheet dengan `valueInputOption=RAW`;
  5. tulis hasil ke `tenant_backup_settings` dan `tenant_backup_runs`.
- **Pemanggilan harian**: hook kecil di layout `_authenticated` memeriksa `last_backup_at`; jika beda hari dan `enabled`, panggil `syncTenantBackup` di latar belakang sekali per sesi.
- **UI**: perluas `src/routes/_authenticated/backup.tsx` (unduhan Excel/CSV yang ada tetap dipertahankan).
