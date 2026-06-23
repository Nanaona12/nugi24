## Tujuan
1. Bisa import banyak batch kadaluarsa sekaligus dari Excel (tanpa input satu-satu).
2. Saat menambah produk baru di halaman Produk, ada bagian "Batch Kadaluarsa" untuk langsung mengisi jumlah + tanggal expired (boleh lebih dari satu baris untuk produk yang sama, mis. Indomie 2 pcs exp 22-07-2026 dan 5 pcs exp 24-07-2027).

---

## 1. Import Excel Batch Kadaluarsa (halaman Kadaluarsa)

### UI
Di `src/routes/_authenticated/kadaluarsa.tsx`, tambah 2 tombol di header (samping "Tambah Batch"):
- **Download Template** — generate file `template-batch-kadaluarsa.xlsx`.
- **Import Excel** — buka file picker `.xlsx/.xls`, parse, preview ringkas (jumlah baris valid / error), lalu tombol "Simpan Semua".

### Format Template
Kolom (header baris 1):
| kode_produk | nama_produk (opsional, info) | jumlah | tanggal_kadaluarsa | catatan (opsional) |

- `kode_produk` wajib, dipakai untuk mencari produk (case-insensitive).
- `jumlah` wajib, integer ≥ 1 (satuan dasar).
- `tanggal_kadaluarsa` wajib, terima format Excel date atau string `YYYY-MM-DD` / `DD-MM-YYYY` / `DD/MM/YYYY`.
- `catatan` opsional.

Sheet kedua "Petunjuk" berisi penjelasan singkat + contoh Indomie 2 baris (exp berbeda).

### Validasi per baris
- Kode produk tidak ditemukan → tandai error.
- Jumlah ≤ 0 atau bukan angka → error.
- Tanggal tidak bisa diparse → error.
- Baris valid masuk antrian insert; baris error ditampilkan di tabel preview dengan alasan.

### Penyimpanan
Insert batch valid ke `product_batches` dalam 1 batch (`insert([...])`) dengan `tenant_id` user saat ini, `source = 'import'`. Tampilkan toast hasil (`X batch berhasil, Y gagal`). Refresh list.

### Library
Gunakan `xlsx` (SheetJS) — sudah lazim dipakai produk lain di project (cek dulu, jika belum ada akan di-`bun add` saat build mode).

---

## 2. Form Batch Saat Tambah Produk Baru (halaman Produk)

Di `src/routes/_authenticated/produk.tsx`, di dialog tambah/edit produk:

### UI
Section baru "Batch Kadaluarsa (opsional)" di bawah field stok:
- List baris dinamis, setiap baris: `[Jumlah]` `[Tanggal Kadaluarsa]` `[Catatan]` `[hapus]`.
- Tombol "+ Tambah Baris Batch".
- Catatan kecil: "Total jumlah batch sebaiknya = stok awal. Stok akan otomatis berkurang dari batch dengan exp terdekat (FEFO) saat transaksi."

### Validasi
- Tiap baris yang diisi: jumlah ≥ 1 (integer), tanggal valid dan tidak boleh sebelum hari ini (boleh tapi diberi peringatan halus — final rule: minimal hari ini, agar tidak salah ketik tahun).
- Boleh tidak isi baris sama sekali (produk tanpa exp tracking tetap bisa).
- Peringatan inline (toast/error helper) jika total batch ≠ stok awal — tidak memblok submit, hanya info.

### Penyimpanan
Setelah produk baru berhasil di-insert dan dapat `product_id`, lakukan `insert` ke `product_batches` untuk semua baris valid sekaligus dengan `tenant_id`, `source = 'manual'`. Jika produk gagal, batch tidak ikut tersimpan. Jika batch gagal, produk tetap ada → toast warning agar user tambah manual via halaman Kadaluarsa.

### Mode Edit
Untuk edit produk, **tidak** menampilkan section ini di plan ini (manajemen batch existing tetap via halaman Kadaluarsa) — supaya scope tetap fokus pada permintaan ("saat menambah produk baru"). Bila user mau, bisa di-extend nanti.

---

## File yang akan diubah
- `src/routes/_authenticated/kadaluarsa.tsx` — tombol Download Template, Import Excel, dialog preview.
- `src/routes/_authenticated/produk.tsx` — section batch di dialog tambah produk + logic insert batch setelah create.
- (mungkin) `package.json` — pastikan `xlsx` sudah terpasang; jika belum, tambahkan saat build mode.

Tidak ada perubahan skema database — tabel `product_batches` sudah cukup.
