# Perbaiki Reset Saldo Pembukuan

## Tujuan
Menjadikan catatan **reset** tanggal 5 September sebagai patokan saldo nol, sehingga perubahan perhitungan transaksi lama tidak lagi mengubah saldo setelah titik reset.

## Perubahan
- Tandai catatan reset lama sebagai **reset saldo**, bukan pengeluaran biasa.
- Ubah perhitungan saldo berjalan agar pada baris reset nilainya tepat Rp0, lalu transaksi setelahnya dihitung mulai dari nol.
- Pastikan pencarian dan penyaringan tampilan tidak mengubah saldo berjalan yang sebenarnya.
- Sesuaikan ringkasan saldo kas agar mengikuti reset saldo terakhir, tanpa menghapus riwayat pemasukan dan pengeluaran sebelumnya.
- Verifikasi urutan tanggal 5 September dan saldo hari-hari setelahnya menggunakan data toko yang ada.

## Detail teknis
- Gunakan nilai `ref = balance_reset` pada catatan reset yang sudah ada agar maknanya eksplisit dan tidak bergantung pada teks keterangan.
- Terapkan checkpoint reset saat menghitung ledger penuh sebelum filter tampilan.
- Perubahan data hanya menandai baris reset yang dimaksud; nominal dan riwayat asli tetap dipertahankan.
