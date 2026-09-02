# Pembelian Tempo (Barang Datang Dulu, Bayar di Jatuh Tempo)

Saat ini PO tidak mencatat apa pun ke Pembukuan — uang keluar hanya tercatat kalau Anda menulis pengeluaran manual. Jadi masalah "minus di pembukuan" bisa diselesaikan dengan mencatat pembelian tempo sebagai **hutang ke supplier**, bukan sebagai uang keluar saat barang datang.

## Konsep

```text
Barang datang (PO diterima)  ->  Stok bertambah, Hutang Supplier bertambah
                                 (pembukuan TIDAK berkurang)
Bayar (sebagian/lunas)       ->  Uang keluar tercatat di Pembukuan
                                 Hutang Supplier berkurang
```

## Yang dibangun

1. **Termin pembayaran di PO**
   - Pilihan saat membuat/menerima PO: Tunai (bayar langsung) atau Tempo.
   - Kalau Tempo: isi tanggal jatuh tempo (atau pilih cepat 7/14/30 hari), plus nomor faktur supplier opsional.
   - Tunai: langsung tercatat sebagai uang keluar di Pembukuan saat PO diterima.
   - Tempo: tidak mengurangi kas, hanya membuat catatan hutang supplier.

2. **Halaman Hutang Supplier**
   - Daftar faktur belum lunas: supplier, no. faktur, tanggal datang, jatuh tempo, total, sudah dibayar, sisa.
   - Tombol Bayar (tunai/transfer, boleh cicil) — setiap pembayaran otomatis jadi entri uang keluar di Pembukuan.
   - Status: Belum Lunas / Sebagian / Lunas, dan penanda Jatuh Tempo Hari Ini / Terlambat.
   - Filter dan pencarian per supplier.

3. **Peringatan jatuh tempo**
   - Badge di sidebar dan banner di Dashboard/Admin bila ada faktur jatuh tempo dalam 3 hari atau sudah lewat.

4. **Pembukuan lebih jujur**
   - Ringkasan tambahan: total Hutang Supplier belum lunas, agar terlihat bahwa kas yang ada belum tentu milik toko sepenuhnya.

## Catatan teknis

- Migrasi database:
  - `purchase_orders`: tambah `payment_terms` ('cash' | 'credit'), `due_date`, `supplier_invoice_no`.
  - Tabel baru `supplier_debts` (tenant_id, po_id, supplier, invoice_no, total, paid_amount, due_date, status) + `supplier_debt_payments` (amount, method, note, tanggal), lengkap dengan GRANT, RLS per tenant, dan trigger rekap `paid_amount`/`status`.
  - Trigger: setiap pembayaran hutang supplier otomatis menulis entri `bookkeeping_entries` kind `out`; PO tunai menulis entri `out` saat diterima.
- Frontend: pilihan termin di `po.tsx` + `ReceivingDialog.tsx`, halaman baru `src/routes/_authenticated/hutang-supplier.tsx` (mengikuti pola halaman Hutang pelanggan), item sidebar di grup Pembelian, ringkasan di `pembukuan.tsx`.
