## Tujuan
Saat kasir closing shift dengan selisih **kurang** (fisik kas < kas seharusnya), selisih tersebut otomatis mengurangi keuntungan yang tampil di halaman Keuntungan. Jika selisih **lebih**, tidak menambah keuntungan (dianggap kelebihan yang perlu ditelusuri, aman default: diabaikan dari profit) — bisa dikonfirmasi ulang bila perlu.

## Perubahan

### 1. Server: `src/lib/cashier.functions.ts` — `closeShift`
Setelah shift ter-update, bila `difference < 0`:
- Insert `bookkeeping_entries` `kind='out'` sebesar `Math.abs(difference)` dengan deskripsi `"Selisih kurang kasir (closing shift <shortId>) - <cashier_name>"`, `ref = shift_id`.
- Insert `profit_activity_log` tipe `shift_shortage` dengan `amount = Math.abs(difference)`, catat kasir + shift id (agar terlihat di riwayat aktivitas profit).

Tidak buat entri apa pun kalau `difference >= 0` (menghindari efek ganda pada kas lebih).

### 2. Client: `src/routes/_authenticated/keuntungan.tsx`
- Query tambahan: `cashier_shifts` dengan `status='closed'`, `closed_at` dalam range filter + setelah `profit_reset_at`, ambil `difference` yang `< 0`.
- Hitung `totalShortage = sum(|difference|)` untuk keseluruhan / today / month / year mengikuti bucketing tanggal yang sudah ada.
- Kurangi metrik: `allProfit`, `todayProfit`, `monthProfit`, `yearProfit`, serta baris daily/monthly/yearly yang bersinggungan (kolom profit & margin di-recompute).
- Tambah kartu ringkas kecil "Selisih Kas Kasir (mengurangi untung)" menampilkan `totalShortage` di range aktif, agar user tahu asal pengurangan.
- Riwayat Aktivitas Profit menampilkan entri `shift_shortage` (label: "Selisih kurang kasir").

### 3. Tanpa migrasi baru
`profit_activity_log` & `bookkeeping_entries` sudah ada; hanya menambah jenis entri baru — tidak perlu perubahan skema.

## Catatan teknis
- Pengurangan profit dilakukan di layer tampilan Keuntungan saja; halaman Riwayat, Pembukuan, dan Dashboard tetap menampilkan angka mentahnya (Pembukuan akan otomatis mencatat "Selisih kurang kasir" sebagai kas keluar sehingga saldo kas ikut sinkron).
- Ekspor CSV di halaman Keuntungan ikut memakai nilai profit yang sudah dikurangi shortage.
