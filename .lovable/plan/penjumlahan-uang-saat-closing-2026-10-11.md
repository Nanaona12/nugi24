# Penjumlahan uang saat closing

## Perubahan
- Ganti penghitung pecahan uang dengan **Jumlahkan uang**, tanpa bentuk kalkulator.
- Tampilkan daftar nominal yang bisa ditambah: misalnya **Rp150.000 + Rp20.000 + Rp30.000 = Rp200.000**.
- Setiap baris memiliki nominal dan catatan opsional, misalnya “uang laci” atau “uang tambahan”.
- Sediakan tombol tambah baris, hapus baris, dan kosongkan hitungan; total otomatis berubah saat nominal diedit.
- Tombol **Gunakan sebagai fisik kas** memasukkan total ke kolom fisik kas closing.
- Catatan hanya untuk membantu penjumlahan dalam sesi closing, bukan catatan pengeluaran atau transaksi Pembukuan.
- Pertahankan alur keluar ke halaman login setelah closing berhasil dan aturan Pembukuan/keuntungan yang berlaku.

## Detail teknis
- Ganti tampilan `ClosingCashCount` dan fungsi penjumlahannya dari jumlah pecahan menjadi daftar nominal dengan catatan.
- Sesuaikan label di dialog closing tanpa mengubah perhitungan closing di server.

## Verifikasi
- Uji Rp150.000 + Rp20.000 + Rp30.000 menghasilkan Rp200.000; pengeditan, penghapusan, dan reset menghitung ulang dengan benar.
- Periksa format ribuan rupiah dan penolakan nominal tidak valid.
- Uji di tampilan closing bahwa catatan dapat diisi dan total diterapkan ke fisik kas, tanpa membuat transaksi keuangan tambahan.
