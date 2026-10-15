# Program Loyalitas Pelanggan

## Yang akan dibuat
1. **Halaman Pelanggan (Admin) jadi daftar loyalitas**
   - Kolom: nama/WA, jumlah transaksi, total belanja, estimasi laba bersih dari pelanggan, poin aktif, status member (Bronze/Silver/Gold/Platinum), rekomendasi reward.
   - Filter periode (tahun ini default) dan urutkan berdasarkan laba/poin/belanja.
   - Laba dihitung dari item transaksi pelanggan (harga jual - modal - diskon), dicocokkan lewat nomor HP di transaksi.

2. **Aturan reward (bisa diatur di halaman yang sama)**
   - Batas reward maksimal % dari laba pelanggan (default 5%).
   - Ambang tingkat member berdasarkan laba setahun (default: Silver Rp100rb, Gold Rp300rb, Platinum Rp750rb).
   - Rekomendasi otomatis: "layak voucher Rp X" = laba x batas %.

3. **Pemberian reward tercatat benar**
   - Tombol **Beri Reward**: pilih jenis (voucher/produk bonus/uang), nominal (dibatasi rekomendasi, admin boleh ubah), poin yang dipakai.
   - Saat reward diberikan: poin pelanggan berkurang, tercatat di riwayat reward, dan masuk Pembukuan sebagai pengeluaran "Biaya loyalitas pelanggan" sehingga mengurangi keuntungan di halaman Untung.
   - Produk bonus: tidak ada keluar uang kas, dicatat sebagai biaya reward sebesar modal barang.

4. **Ringkasan atas**
   - Total poin aktif, estimasi kewajiban reward (potensi biaya), total reward yang sudah diberikan tahun ini, dan laba setelah reward.

## Catatan pembukuan
- Mendapat poin tidak mengubah kas atau laba.
- Hanya reward yang benar-benar diberikan yang mengurangi laba/kas.

## Detail teknis
- Tabel baru `loyalty_settings` (per toko) dan `customer_rewards` (riwayat, tenant-scoped, RLS pemilik; kasir tidak bisa).
- Trigger pada `customer_rewards`: kurangi `customers.points`, tulis `bookkeeping_entries` (kas) atau entri biaya non-kas untuk produk bonus; halaman Untung ikut mengurangi biaya reward.
- Agregasi laba per pelanggan via server function bertahap (chunk) agar tidak terpotong batas 1.000 baris.
- Tes kecil untuk rumus tier dan batas reward.
