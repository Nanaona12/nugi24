# Backup otomatis MySQL di komputer

## Hasil yang dibuat
- Tambahkan pengaturan **Backup MySQL** di halaman Backup Data, khusus pemilik toko.
- Siapkan program sinkron lokal beserta panduan menjalankannya dari VS Code dan menjadwalkannya di komputer.
- Data aplikasi tetap disimpan di layanan saat ini; MySQL menjadi cadangan terpisah, bukan pengganti.
- Backup mencakup katalog dan satuan, transaksi beserta item/struk, refund, pelanggan, hutang dan pembayaran, supplier, PO, shift, pengeluaran, Pembukuan, serta log bisnis. Tidak menyalin password, PIN, token, atau rahasia koneksi.

## Riwayat tidak ikut dihapus
- Mulai dengan salinan data yang masih tersedia, lalu catat penambahan, perubahan, dan penghapusan sebagai peristiwa baru.
- MySQL menyimpan versi sebelumnya; sinkron tidak menjalankan penghapusan atau penimpaan riwayat.
- Catatan perubahan disimpan juga di Cloud agar perubahan saat komputer mati dapat diambil ketika komputer menyala kembali.
- Data yang sudah dihapus sebelum pencatatan diaktifkan tidak bisa dipulihkan melalui fitur ini.
- Sinkron lokal hanya berjalan saat komputer, internet, dan MySQL tersedia; catatan menunggu di Cloud selama komputer mati.

## Keamanan dan koneksi
- Hubungkan komputer melalui persetujuan pemilik toko; akses hanya ke backup toko tersebut dan bisa dicabut.
- Kredensial MySQL tetap di komputer, bukan dikirim ke aplikasi atau ditulis dalam paket unduhan.
- Akun sinkron MySQL diberi akses baca/tambah saja ke riwayat; tidak diberi hak menghapus atau memperbarui baris riwayat.
- “Tidak dihapus” berlaku untuk program sinkron; pemilik akses penuh MySQL tetap bisa menghapus database secara manual, sehingga disertakan panduan salinan cadangan tambahan.

## Detail teknis
- Buat jurnal perubahan tenant-scoped dengan RLS, GRANT eksplisit, dan trigger pencatatan pada tabel bisnis yang dipilih. Jurnal tidak dapat diubah/dihapus oleh klien biasa.
- Gunakan nomor urut dan penanda kelanjutan yang aman terhadap transaksi bersamaan; sinkron ulang idempoten tanpa melewatkan peristiwa.
- Buat koneksi perangkat terbatas dan dapat dicabut, dengan token disimpan aman dan verifikasi pemilik sebelum pemasangan.
- Program lokal menarik halaman peristiwa melalui akses terautentikasi, lalu melakukan insert idempoten ke MySQL. Penanda kelanjutan disimpan setelah insert berhasil.
- Simpan payload bisnis sebagai JSON dengan identitas toko, tabel, baris, versi, dan waktu. Sediakan tampilan baca untuk transaksi, item, PO, serta Pembukuan agar mudah ditelusuri di VS Code.
- Program lokal dan dependensi MySQL dipisahkan dari aplikasi web.

## Verifikasi
- Uji tambah → ubah → hapus: semua versi tetap tersedia di MySQL.
- Uji komputer offline lalu sinkron kembali, pengulangan sinkron, dan pemutusan saat proses berjalan.
- Uji penolakan akses toko lain, kasir, dan perangkat yang dicabut.
- Uji salinan awal serta angka transaksi/Pembukuan tanpa mengubah data bisnis asli.
- Koneksi MySQL di komputer Anda baru dapat diverifikasi setelah program dipasang dan dijalankan di sana.
