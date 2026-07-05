
# Rencana: Cetak Struk Fisik ke Printer

Menambah dukungan **print fisik** untuk struk transaksi dari halaman kasir dan riwayat, dengan 3 metode: Browser Print, Bluetooth Thermal (ESC/POS), USB Thermal (ESC/POS). Mendukung kertas **58mm dan 80mm**, dan pengaturan **auto-print** setelah transaksi selesai.

## Yang akan dibangun

### 1. Pengaturan printer (di halaman Pengaturan)
Bagian baru "Printer Struk":
- **Metode default**: Browser / Bluetooth / USB / Tanya setiap kali
- **Ukuran kertas**: 58mm atau 80mm
- **Auto-print setelah transaksi**: on/off
- **Nama header/footer struk** (opsional, pakai yang sudah ada dari tenant)
- Tombol "Uji Cetak" untuk tes tanpa harus transaksi
- Tombol "Pasangkan printer Bluetooth" / "Pasangkan printer USB" (menyimpan device id di localStorage supaya tidak perlu pilih ulang tiap kali)

Semua pengaturan disimpan di `localStorage` per perangkat (bukan di database) karena tiap kasir bisa punya printer beda.

### 2. Metode cetak

**a. Browser Print (universal)**
- Render struk ke halaman HTML tersembunyi dengan CSS `@page` ukuran 58mm/80mm dan style monospace.
- Panggil `window.print()`. Bekerja untuk printer thermal (via driver) maupun printer biasa. Kompatibel semua device.

**b. Bluetooth Thermal (Web Bluetooth API)**
- Buat encoder ESC/POS ringan (tanpa library Node) untuk: init, teks kiri/tengah/kanan, bold, size normal/besar, feed, cut, garis putus-putus.
- Kirim byte via GATT characteristic ke printer (service `000018f0-0000-1000-8000-00805f9b34fb`).
- Simpan device untuk auto-reconnect. Deteksi platform: sembunyikan opsi ini di iOS/Safari dengan pesan penjelasan.

**c. USB Thermal (Web USB API)**
- Encoder ESC/POS sama seperti Bluetooth.
- `navigator.usb.requestDevice()` dengan filter class printer (0x07), lalu `transferOut` ke endpoint bulk.
- Simpan `vendorId`/`productId`. Deteksi Chromium: sembunyikan di browser lain.

### 3. Integrasi ke alur transaksi
- **Kasir (setelah bayar sukses)**: jika auto-print ON, cetak otomatis pakai metode default. Tambah juga tombol "Cetak Struk" di dialog sukses (samping tombol WhatsApp / Unduh PNG yang sudah ada).
- **Riwayat**: tombol "Cetak Struk" di dialog detail transaksi (samping "Unduh PNG").

### 4. Fitur pendukung
- Toast bila printer belum dipasangkan / gagal konek, dengan tombol shortcut ke Pengaturan.
- Fallback graceful: jika Bluetooth/USB gagal, tawarkan Browser Print.
- Struk berisi data yang sudah ada di `receipt-image.ts`: nama toko, no tx, waktu, item + qty × harga, total, bayar (cash/qris/split), kembali, pelanggan (bila ada), footer terima kasih.

## Rincian teknis

**File baru**
- `src/lib/printer-settings.ts` — load/save preferensi printer di localStorage, tipe `PrinterSettings`.
- `src/lib/escpos.ts` — encoder ESC/POS murni (Uint8Array builder): `init`, `text`, `align`, `bold`, `size`, `feed`, `cut`, `line58`, `line80`.
- `src/lib/printer.ts` — orkestrator: `printReceipt(data, settings)` yang memilih transport (browser/bt/usb), plus helper `pairBluetooth()`, `pairUsb()`, `printBrowser(data,width)`.
- `src/components/PrinterSettingsCard.tsx` — UI pengaturan printer + tombol pasangkan & uji cetak.

**File diedit**
- `src/routes/_authenticated/pengaturan.tsx` — mount `PrinterSettingsCard`.
- `src/routes/_authenticated/kasir.tsx` — panggil `printReceipt` setelah transaksi sukses (jika auto-print), tombol "Cetak Struk" di dialog sukses.
- `src/routes/_authenticated/riwayat.tsx` — tombol "Cetak Struk" di dialog detail (dari data `Tx` + `TxItem[]` yang sudah dipakai untuk PNG).

**Data yang dikirim ke printer** mengikuti `ReceiptData` yang sudah ada di `src/lib/receipt-image.ts`, tapi diformat monospace 32 kolom (58mm) / 48 kolom (80mm).

**Catatan kompatibilitas**
- Web Bluetooth & Web USB hanya jalan di Chrome/Edge (Android + desktop), butuh HTTPS. Di iOS/Safari otomatis hanya tampil opsi Browser Print.
- Semua kode berjalan di browser saja, tidak butuh perubahan backend / migrasi database.

