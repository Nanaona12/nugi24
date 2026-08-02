# Rencana: Selisih Closing Kasir — Pembukuan vs Keuntungan

Berdasarkan pilihan Anda, sistem akan mempertahankan pendekatan **konservatif**:

- **Selisih kurang (minus):** dicatat di pembukuan sebagai kas keluar **dan** mengurangi keuntungan karena merupakan kerugian kas nyata.
- **Selisih lebih (plus):** dicatat di pembukuan sebagai kas masuk, **tetapi tidak menambah keuntungan**.

Logika ini sudah berjalan di `src/routes/_authenticated/keuntungan.tsx` (baris ~549), namun masih ada bagian yang membingungkan di backend.

## Perubahan yang akan dilakukan

### 1. Bersihkan catatan selisih lebih dari `profit_activity_log`

File: `src/lib/cashier.functions.ts`

Saat ini `closeShift` masih menyisipkan `action: "shift_surplus"` ke tabel `profit_activity_log`, padahal nilai tersebut **tidak dipakai** dalam perhitungan keuntungan dan hanya membuat riwayat "Perubahan Keuntungan" tampak bertambah. Karena selisih lebih hanya masuk pembukuan, catatan di `profit_activity_log` akan dihapus.

### 2. Tambahkan keterangan UI di halaman Keuntungan

File: `src/routes/_authenticated/keuntungan.tsx`

Agar tidak membingungkan, akan ditambahkan teks penjelasan singkat di dekat ringkasan keuntungan:

> "Selisih lebih closing kasir hanya menambah catatan kas di pembukuan, bukan keuntungan."

### 3. Verifikasi konsistensi

- Pastikan `shiftShortages` tetap mengurangi profit.
- Pastikan `shiftSurpluses` tetap tidak mengurangi/menambah profit.
- Pastikan pembukuan tetap mencatat kedua jenis selisih sebagai kas masuk/kas keluar.

## Hasil akhir yang diharapkan

- Keuntungan yang ditampilkan hanya berasal dari penjualan, dikurangi kerugian/promo dan selisih kurang kasir.
- Posisi kas di pembukuan tetap akurat karena mencerminkan uang yang benar-benar dihitung saat closing.
- Tidak ada catatan "selisih lebih" yang muncul di Riwayat Perubahan Keuntungan.

## Catatan teknis

Tidak ada perubahan struktur database. Hanya penghapusan penyisipan data yang tidak konsisten dan penambahan label UI.