# Laporan closing sebelum keluar

## Perubahan
- Setelah tombol **Tutup Shift** berhasil, tetap tampilkan hasil closing dan jangan langsung mengeluarkan kasir.
- Tampilkan satu laporan yang berisi ringkasan closing serta seluruh struk transaksi dalam shift tersebut, termasuk rincian barang, jumlah/satuan, pembayaran, dan total.
- Sediakan tombol **Lihat / Cetak PDF**; tampilan laporan dapat dicetak atau disimpan sebagai PDF dari browser.
- Kasir baru keluar ke halaman masuk setelah menekan **Selesai & Keluar** pada hasil closing.
- Pertahankan pencatatan Pembukuan, keuntungan, dan perhitungan closing yang sudah ada.

## Detail teknis
- Perluas data ringkasan shift dengan snapshot item transaksi yang sudah tersimpan, sehingga isi struk konsisten dengan Riwayat.
- Gabungkan ringkasan closing dan kumpulan struk dalam dokumen cetak A4 dengan pemisah halaman yang rapi.
- Tahan sinkronisasi shift selama hasil closing masih ditampilkan, lalu jalankan alur keluar lokal yang sudah ada.

## Verifikasi
- Tutup shift uji yang memiliki beberapa transaksi dan pastikan hasil closing tetap tampil.
- Pastikan laporan memuat semua struk shift beserta barang, jumlah/satuan, metode pembayaran, dan totalnya.
- Pastikan cetak/simpan PDF dapat dibuka, lalu **Selesai & Keluar** membersihkan sesi kasir dan menuju halaman masuk.
