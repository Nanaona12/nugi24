Update receipt (PNG image + WhatsApp text caption) untuk menampilkan rincian pembayaran split.

## Perubahan

### 1. `src/lib/receipt-image.ts`
- Tambah field opsional pada `ReceiptInput`: `cashPart?: number`, `qrisPart?: number`.
- Pada blok render pembayaran (sekitar baris 172–184):
  - Jika `paymentMethod === "split"` DAN `cashPart`/`qrisPart` tersedia: render 3 baris berurutan:
    - `Cash` → `formatRupiah(cashPart)`
    - `QRIS` → `formatRupiah(qrisPart)`
    - `Total Bayar` → `formatRupiah(paid)` (bold ringan)
  - Selain itu (cash/qris murni): tetap render `Bayar (METHOD)` seperti sekarang.
- Baris `Kembali` selalu ditampilkan jika `change > 0` (untuk split, kembalian diambil dari porsi cash sehingga tetap akurat).

### 2. `src/routes/_authenticated/kasir.tsx`
- Saat memanggil `renderReceiptPng` (sekitar baris 493), teruskan `cashPart: receipt.cashPart` dan `qrisPart: receipt.qrisPart`.
- Pada penyusunan teks WhatsApp (sekitar baris 1088–1091), jika `r.paymentMethod === "split"`, ganti baris `Bayar` tunggal menjadi:
  ```
  Cash    : Rp xxx
  QRIS    : Rp xxx
  Bayar   : Rp xxx (SPLIT)
  ```
  Selain itu, biarkan format lama.
- Baris `Kembali` tetap ditampilkan apa adanya.

## Catatan teknis

- Tidak ada perubahan database / server function.
- Tidak menyentuh logika checkout, validasi, atau QRIS.
- Type `ReceiptInput.paymentMethod` diperluas komentarnya menjadi `cash | qris | split`.