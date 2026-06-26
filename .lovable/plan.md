Akan menambah 3 fitur:

## 1. Refund di Kasir (cari berdasarkan nomor struk)
- Tabel baru `refunds` + `refund_items` dengan tenant_id, transaction_id, reason, total, created_by, created_at.
- Trigger DB: saat refund_item dibuat → tambah stok produk kembali (qty × unit_conversion).
- Tombol "Refund" di halaman Kasir → dialog: input nomor struk (8 digit pertama atau full) → load transaksi + item → pilih item & qty yang direfund → simpan.
- Tampilkan riwayat refund di halaman Riwayat (badge).

## 2. Receiving Barang (digabung di PO)
- Tambah kolom di `purchase_order_items`: `qty_received` (int), dan di `purchase_orders`: `received_at`, `received_status` ('pending' | 'partial' | 'received').
- Di halaman PO: tombol "Terima Barang" pada PO yang status-nya `ordered` → dialog list item PO, input qty diterima per baris (default = qty pesan), opsional expiry date per item.
- Saat disimpan:
  - Tambah stok produk sesuai qty_received × unit_conversion.
  - Bila exp date diisi → buat row `product_batches`.
  - Update status PO ke partial/received.

## 3. Rekomendasi Gaji Karyawan (per shift / per bulan)
- Halaman Karyawan: card "Rekomendasi Gaji" per kasir.
- Hitung dari `cashier_shifts` & `transactions` (filter by cashier_id, periode bulan ini):
  - Total transaksi shift, total penjualan, estimasi laba (memakai cost_price seperti di halaman Keuntungan).
  - Rekomendasi:
    - **Gaji Pokok**: Rp 1.500.000 (UMR warung kecil, bisa diubah)
    - **Bonus Performa**: 5% dari laba yang dihasilkan kasir bulan ini.
    - **Bonus Referral / Promosi**: Rp 50.000 per pelanggan baru yang dibawa (placeholder field manual).
  - Slider untuk owner mengatur % bonus & gaji pokok (disimpan ke localStorage per tenant).
- Tujuan: motivasi kasir mempromosikan toko.

## File yang akan diubah/dibuat
- migration baru: tabel refunds/refund_items + kolom receiving + triggers
- `src/routes/_authenticated/kasir.tsx` — dialog Refund
- `src/routes/_authenticated/po.tsx` — dialog Terima Barang
- `src/routes/_authenticated/karyawan.tsx` — section rekomendasi gaji
- `src/routes/_authenticated/riwayat.tsx` — tampilkan refund badge

Lanjut implementasi?