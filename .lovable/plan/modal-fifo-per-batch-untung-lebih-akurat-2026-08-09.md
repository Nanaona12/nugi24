# Modal FIFO per Batch — Untung Lebih Akurat

Tujuan: kalau kemarin beli produk A modal Rp3.000 dan hari ini Rp2.500, penjualan hari ini tetap memakai modal Rp3.000 sampai stok lama habis, baru pindah ke Rp2.500.

## Kondisi sekarang

- Sistem sudah punya catatan batch (harga modal per pembelian) dan sudah mengurangi stok batch tertua saat terjual.
- Masalahnya: dari 533 produk, 452 punya stok yang tidak punya catatan batch sama sekali (hasil edit stok manual, import Excel, atau stok lama sebelum fitur batch). Untuk stok itu sistem terpaksa memakai "modal terakhir yang diinput", sehingga untung ikut berubah saat harga beli berubah.
- Saat penerimaan PO, harga modal produk selalu ditimpa harga beli terbaru.

## Yang akan dikerjakan

1. **Batch otomatis untuk semua penambahan stok**
   Setiap kali stok bertambah — penerimaan PO, edit stok manual di halaman Produk, import Excel, atau saat produk baru dibuat dengan stok awal — sistem otomatis membuat catatan batch berisi jumlah dan modal saat itu.

2. **Batch awal untuk stok yang sudah ada**
   Stok yang saat ini belum punya batch akan dibuatkan satu batch awal memakai harga modal produk yang tercatat sekarang, supaya perhitungan FIFO langsung jalan tanpa data kosong.

3. **Urutan pemakaian modal: yang lebih dulu masuk, dipakai duluan**
   Saat barang terjual, modal diambil dari batch paling lama (barang mendekati kedaluwarsa tetap diprioritaskan lebih dulu, lalu yang paling lama dibeli). Kalau satu penjualan menghabiskan dua batch berbeda harga, modalnya dihitung campur sesuai porsi masing-masing.

4. **Harga modal produk jadi acuan cadangan saja**
   Harga modal di master produk tetap diperbarui sebagai referensi harga beli terakhir dan patokan harga jual, tetapi tidak lagi dipakai untuk menghitung untung selama batch masih tersedia. Pengaman lama yang mengganti modal batch saat nilainya terlalu tinggi diperketat agar hanya aktif untuk kasus salah input yang jelas (modal per kemasan tercatat sebagai per pcs), bukan untuk selisih harga beli yang wajar.

5. **Transparansi di UI**
   - Halaman Produk: tampilkan rincian batch stok (jumlah + modal per batch) saat produk dibuka, agar terlihat sisa stok modal lama vs baru.
   - Halaman Riwayat/Keuntungan: modal per transaksi tetap memakai nilai yang tersimpan saat transaksi terjadi, jadi laporan lama tidak berubah.

## Catatan teknis

- Migrasi: fungsi `fefo_deduct_batches` diperbarui (urutan `expiry_date NULLS LAST, created_at`, hitung rata-rata tertimbang lintas batch, longgarkan guard 3×), plus trigger baru pada `products` yang membuat batch `source='manual'` saat stok naik tanpa batch pendamping, dan seeding batch awal untuk stok tanpa batch.
- Frontend: `ReceivingDialog.tsx` tetap membuat batch per penerimaan; `produk.tsx` menampilkan daftar batch dan mengirim modal saat menambah stok manual/import.
- `transaction_items.unit_cost` tetap menjadi sumber kebenaran untuk laporan historis (tidak dihitung ulang).
