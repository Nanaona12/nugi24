## Ringkasan masalah

Stok naik ~65 padahal kemarin ada penjualan 65 pcs (harusnya 120 − 65 = 55, bukan 185). Setelah menelusuri kode, saya menemukan **satu penyebab pasti** di alur PO dan **beberapa hal yang perlu diverifikasi lewat log stok** untuk memastikan tidak ada penyebab lain.

## Penyebab utama (confirmed di kode): stok PO ditambahkan dobel

Ada dua jalur berbeda yang sama-sama menambah `products.stock` saat PO diterima:

1. `ReceivingDialog.saveAll` (`src/components/ReceivingDialog.tsx` baris 133–178):
   - Menambah stok = `qty_terima × unit_conversion`
   - Membuat batch di `product_batches`
   - Jika semua item selesai diterima → set `purchase_orders.status = 'received'`

2. `updateStatus(po, "received")` (`src/routes/_authenticated/po.tsx` baris 585–624):
   - Saat status PO dipindah ke "received" (dari tombol status manual di detail PO), fungsi ini **mengulang semua PO item** dan menambah stok lagi = `it.qty × unit_conversion` (pakai qty **pesanan**, bukan `qty_received`).
   - Tidak ada flag "sudah pernah ditambahkan", jadi setiap kali status diubah ke `received` stok ditambah lagi.

Akibatnya, urutan yang wajar ini sudah bikin dobel:
- User buka Receiving Dialog → isi qty terima → simpan (stok +N via dialog, status otomatis jadi `received`).
- User lalu klik tombol "Tandai diterima" / ganti status di detail PO → `updateStatus("received")` jalan lagi → stok +N kedua kalinya.

Dan bahkan tanpa klik ulang, kalau alur user melewati `updateStatus("received")` (misal dari tombol status cepat) setelah ReceivingDialog, jumlahnya jadi 2× qty pesanan.

Ini konsisten dengan gejala: kemarin stok 120, ada penjualan 65 (harusnya turun ke 55), lalu PO diterima X pcs — kalau ada dobel-add di PO, hasilnya bisa naik jauh melebihi yang dipesan.

## Hal lain yang saya cek dan **tidak** jadi penyebab

- Pengurangan stok kasir: `deductProductStock` di server (`cashier.functions.ts`) sudah benar, satu kali per transaksi, pakai qty base unit. Refund punya trigger `refund_restore_stock` yang mengembalikan stok — juga benar (dan bukan sumber kenaikan misterius karena tidak ada refund otomatis).
- Trigger DB: hanya `hw_reduce_stock` (pengambilan rumah tangga, mengurangi) dan `refund_restore_stock` (menambah saat refund). Tidak ada trigger yang menambah stok dari PO — semua penambahan lewat kode aplikasi (dua jalur di atas).

## Perbaikan yang saya usulkan

1. **Hapus penambahan stok dari `updateStatus` di `po.tsx`.**
   Penambahan stok hanya boleh terjadi lewat Receiving Dialog (karena di sanalah user mengisi qty yang benar-benar diterima + expiry + batch). `updateStatus` cukup mengubah kolom status saja, tanpa menyentuh `products.stock` / `cost_price` / `price`.

2. **Tandai status `received` cukup diatur oleh Receiving Dialog** (sudah begitu saat `allReceived`). Untuk transisi status manual lain (draft/ordered/cancelled/partial), tidak perlu mengubah stok.

3. **Tambahkan audit stok cepat**: di halaman **Log Stok** yang sudah ada, tandai baris `stock_movements` yang tidak punya `source` (delta besar tanpa sumber = kandidat penambahan liar dari `updateStatus` lama). Ini membantu user menemukan sisa efek bug lama pada data mereka.

4. **Koreksi manual atas kejadian kemarin**: setelah fix dipasang, saya tidak akan otomatis mengubah stok produk yang sudah terlanjur ke 185 — user perlu koreksi manual (edit stok produk atau catat pengambilan/penyesuaian) karena kita tidak tahu pasti berapa qty PO yang seharusnya. Log stok bisa dipakai untuk melihat delta yang dobel.

## Yang TIDAK diubah

- Alur ReceivingDialog (satu-satunya pintu masuk penambahan stok PO — sudah benar).
- Alur pengurangan stok di kasir & refund.
- Data historis `products.stock` — tidak disentuh otomatis.

## Verifikasi setelah fix

1. Buat PO, terima via Receiving Dialog dengan qty misal 10 → cek stok produk naik tepat 10 (bukan 20).
2. Coba ubah status PO ke "received" lagi manual (kalau UI-nya ada) → stok **tidak** berubah lagi.
3. Buka Log Stok → penambahan hanya muncul 1× dengan `source` menunjuk ke PO.
