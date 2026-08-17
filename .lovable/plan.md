# Rekomendasi Prioritas Order (Barang Laris & Stok Menipis)

Tujuan: di halaman PO, daftar "Produk Habis / Stok Menipis" tidak lagi urut abjad, tapi urut **paling mendesak diorder** — barang yang cepat laku, peminat banyak, dan stoknya tinggal sedikit muncul paling atas.

## Cara menentukan prioritas

Sistem membaca penjualan 30 hari terakhir per produk, lalu menghitung:

- **Kecepatan laku** = total unit terjual 30 hari ÷ 30 (per hari)
- **Peminat** = berapa banyak struk berbeda yang memuat produk itu (semakin sering muncul di transaksi berbeda, semakin banyak peminatnya)
- **Sisa hari stok** = stok sekarang ÷ kecepatan laku
- **Skor prioritas** = makin cepat laku + makin banyak peminat + makin sedikit sisa hari → skor makin tinggi. Barang sudah habis (stok 0) yang laris otomatis paling atas.

Barang yang stoknya menipis tapi hampir tidak pernah laku akan turun ke bawah, supaya modal tidak tertahan di barang lambat.

## Yang akan terlihat di halaman PO

1. Kartu "Produk Habis / Stok Menipis" bertambah pilihan urutan: **Prioritas (default)**, Nama, Stok terkecil.
2. Setiap baris menampilkan info baru:
   - Badge prioritas: **Mendesak / Tinggi / Sedang / Rendah**
   - Terjual 30 hari (mis. "40 pcs / 30 hr")
   - Perkiraan sisa hari stok (mis. "habis ~2 hari lagi")
3. Filter baru: **Hanya barang laris** (menyembunyikan barang yang tidak laku 30 hari terakhir).
4. Tombol baru: **Buat PO Prioritas (N)** — membuat PO berisi barang skor Mendesak + Tinggi saja, dengan saran jumlah order = kebutuhan ±14 hari dikurangi stok sekarang (dibulatkan ke atas), tetap bisa diedit user.
5. Tombol PO yang sudah ada (Habis / Semua / per Kategori) tetap berfungsi seperti sekarang, hanya ikut urutan prioritas.

## Catatan teknis

- Data penjualan diambil sekali saat halaman PO dimuat: query `transaction_items` (join `transactions.created_at >= now() - 30 hari`, filter tenant), diagregasi di klien menjadi `{ product_id: { qtyBase, receipts } }` memakai `qty * unit_conversion` agar konsisten ke unit dasar.
- Skor: `velocity = qtyBase/30`; `daysLeft = stock/velocity` (∞ bila velocity 0); `score = velocity * log(1+receipts) / max(daysLeft, 0.5)`; stok 0 dengan velocity > 0 diberi bobot maksimum. Ambang badge: Mendesak `daysLeft <= 3`, Tinggi `<= 7`, Sedang `<= 14`, sisanya Rendah.
- Semua perubahan di `src/routes/_authenticated/po.tsx` (state urutan/filter, memo `lowStockProducts` diperluas dengan metrik, kolom tabel, tombol PO prioritas). Tidak ada perubahan skema database.
