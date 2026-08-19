# Sidebar Rapi + Kontak Supplier & Bandingkan Harga

## 1. Sidebar dikelompokkan

Menu owner sekarang satu daftar panjang (18 item). Dipecah jadi grup ber-label:

- **Operasional**: Kasir (kasir), Riwayat, Riwayat Shift, Hutang, Pelanggan
- **Barang**: Produk, Log Stok, Kadaluarsa, Pengambilan, Promo
- **Pembelian**: PO, Supplier (baru)
- **Laporan**: Untung, Pembukuan
- **Pengaturan**: Karyawan, Koneksi, Backup Data, Langganan, Pengaturan

Aturan yang dipertahankan: item khusus Paket Grosiran tetap disembunyikan untuk Paket Warung, grup yang jadi kosong tidak dirender, mode sidebar collapse (icon-only) tetap jalan, badge jumlah hutang tetap ada. Menu kasir juga dikelompokkan (Operasional / Data) walau lebih pendek.

## 2. Kontak Supplier

Halaman baru `/supplier`:
- Daftar supplier: nama, no. HP/WA, alamat, sales/PIC, catatan.
- Tambah / edit / hapus.
- Tombol WhatsApp langsung ke nomor supplier.
- Cari supplier.

Di form "Buat PO", kolom nama supplier jadi combobox: pilih supplier tersimpan atau ketik nama baru (nama baru bisa langsung disimpan ke daftar supplier). Nilai yang tersimpan di PO tetap teks nama supplier, jadi PO lama tidak berubah.

## 3. Bandingkan harga antar supplier

Kartu "Bandingkan Harga Supplier" di halaman Supplier (dan tombol pintas dari halaman PO):
- Pilih produk (combobox produk yang pernah dibeli).
- Tabel per supplier: harga modal per unit dasar terakhir, harga terendah/tertinggi, rata-rata, tanggal pembelian terakhir, total qty dibeli.
- Supplier termurah ditandai badge "Termurah" + selisih Rp dan % terhadap supplier lain.
- Riwayat detail: tanggal, supplier, satuan, qty, harga satuan, harga per unit dasar.

Sumber data: item PO yang sudah diterima (`purchase_order_items` + `purchase_orders`). Perbandingan dinormalkan ke harga per unit dasar (`unit_cost / unit_conversion`) supaya beli per dus vs per pcs tetap adil dibandingkan.

Tambahan di halaman PO: saat menambah baris produk di PO baru, muncul info kecil "Termurah: <supplier> Rp x" untuk produk tersebut.

## Teknis

- Migrasi: tabel `public.suppliers` (id, tenant_id, name unik per tenant, phone, address, contact_person, note, timestamps) + GRANT untuk `authenticated`/`service_role` + RLS berbasis `current_tenant_id()` seperti tabel tenant lain, plus trigger `tg_set_updated_at`.
- File baru: `src/routes/_authenticated/supplier.tsx`, komponen `SupplierCombobox`, dan `src/lib/supplier-compare.ts` (agregasi harga per supplier dari PO diterima).
- Edit: `src/routes/_authenticated/route.tsx` (grup sidebar + menu Supplier), `src/routes/_authenticated/po.tsx` (combobox supplier + hint harga termurah).
- Halaman `/supplier` mengikuti gate paket Grosiran, sama seperti `/po`.
