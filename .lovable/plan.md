## Masalah

Transaksi **SPLIT** (bayar sebagian tunai + sebagian QRIS) tidak dihitung dengan benar di ringkasan shift.

Contoh dari screenshot Anda:
- Struk #74778990 SPLIT: Total Rp 409.300 → Cash Rp 244.000 + QRIS Rp 165.300.
- Di closing shift muncul QRIS hanya Rp 42.500 (padahal harusnya ≥ Rp 200 rb) dan tunai kurang ~Rp 300 rb, sehingga setoran ke pembukuan jadi Rp 2.423.100 bukan Rp 2.725.900.

### Penyebab

Di `src/lib/cashier.functions.ts` (fungsi `getShiftSummary` dan `closeShift`), penjumlahan dilakukan seperti ini:

```
if payment_method === "cash"  → masuk total_cash
else if payment_method === "qris" → masuk total_qris
else                              → masuk total_other   ← SPLIT nyangkut di sini
```

Padahal tabel `transactions` menyimpan porsi QRIS di kolom terpisah `qris_amount`. Untuk transaksi `split`:
- Porsi QRIS ada di `qris_amount` — sekarang **diabaikan** (tidak masuk `total_qris`).
- Porsi tunai = `total - qris_amount` — sekarang **tidak masuk** `total_cash`, jadi `expected_cash` (setoran) kurang.

Transaksi **kasbon/hutang** juga sebaiknya tidak dihitung sebagai kas masuk (tidak ada uang diterima).

## Perbaikan

Ubah logika pembagian di dua fungsi (`getShiftSummary` dan `closeShift`) di `src/lib/cashier.functions.ts` — juga tarik kolom `qris_amount` di query — menjadi:

```
qris_portion = Number(t.qris_amount) || 0
if payment_method === "cash":
    cash_portion = total
elif payment_method === "qris":
    cash_portion = 0            (qris_portion fallback = total kalau kolom kosong)
elif payment_method === "split":
    cash_portion = max(0, total - qris_portion)
elif payment_method === "debt" (kasbon):
    cash_portion = 0, qris_portion = 0     # tidak ada uang diterima
else:  # transfer / lainnya
    cash_portion = 0
    other_portion = total - qris_portion

total_cash  += cash_portion
total_qris  += qris_portion
total_other += other_portion (kalau ada)
```

`expected_cash = opening_cash + total_cash − total_expenses` akan otomatis benar → setoran otomatis ke pembukuan juga kembali sesuai.

## Verifikasi setelah fix

1. Buka closing shift hari ini → QRIS harus ≥ Rp 200 rb, tunai naik ~Rp 300 rb, total penjualan tetap Rp 2.725.900.
2. Cek Pembukuan → entri "Setoran kasir" ikut menyesuaikan pada shift berikutnya (entri lama yang sudah tercatat tidak berubah otomatis — bisa dikoreksi manual bila perlu, saya tidak akan menyentuh data pembukuan lama tanpa persetujuan).

## Yang TIDAK diubah

- Alur pencatatan transaksi di kasir (data `qris_amount` sudah benar tersimpan).
- Data pembukuan/shift lama yang sudah ditutup.
