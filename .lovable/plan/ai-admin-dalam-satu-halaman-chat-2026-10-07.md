# AI Admin dalam satu halaman chat

## Hasil yang akan dibuat
- Tambahkan menu **AI Admin** khusus pemilik/admin toko; sesi kasir tidak dapat membuka halaman atau memanggil layanannya.
- Sediakan satu percakapan yang tersimpan di database dan tetap tersedia saat dibuka dari perangkat lain.
- Chat menerima teks, hingga beberapa foto nota/faktur, dan rekaman suara. Rekaman diubah menjadi teks Indonesia sebelum dikirim.
- AI dapat menjawab pertanyaan berbasis data toko, misalnya total keuntungan pada rentang tanggal tertentu, rincian supplier, produk, stok, dan riwayat PO.
- Untuk perintah seperti “buatkan PO dari nota ini”, AI membaca gambar, mencocokkan supplier dan produk, lalu menanyakan data yang belum jelas.
- AI menampilkan kartu ringkasan PO berisi supplier, barang, satuan, jumlah, harga modal, total, termin, dan jatuh tempo. PO hanya dibuat setelah admin menekan **Setujui & Buat PO**.

## Alur utama
1. Admin membuka halaman AI Admin dan mengirim teks, foto, atau rekaman suara.
2. AI memilih alat baca data yang sesuai dan menjelaskan hasilnya di chat.
3. Untuk PO, AI menyusun draf dan meminta konfirmasi jika supplier, satuan, jumlah, harga, atau termin belum pasti.
4. Setelah admin menyetujui, server memvalidasi ulang semua data, membuat PO berstatus **Draft**, menyimpan foto nota ke penyimpanan privat toko, lalu menampilkan tautan menuju detail PO.
5. Pembuatan draf PO tidak langsung menambah stok atau mengubah Pembukuan; alur penerimaan PO yang sudah ada tetap menjadi sumber perubahan tersebut.

## Keamanan dan data
- Semua pembacaan dan penulisan dibatasi dengan `tenant_id` toko aktif serta diverifikasi lagi di server.
- Hak akses diperiksa dari sesi pengguna dan keanggotaan/role server-side; tidak memakai penanda browser untuk menentukan admin.
- Buat tabel percakapan/pesan AI dengan `GRANT`, RLS, indeks, dan kebijakan khusus pemilik/admin toko. Pesan menyimpan format `UIMessage` lengkap agar teks, reasoning, permintaan alat, hasil alat, dan persetujuan dapat dipulihkan dengan benar.
- Foto chat disimpan privat per toko; rekaman suara dipakai untuk transkripsi dan yang disimpan dalam riwayat adalah teks hasilnya.
- Alat baca bersifat read-only. Alat yang membuat PO selalu membutuhkan persetujuan eksplisit dan memeriksa ulang kepemilikan supplier/produk sebelum menulis.

## Teknis
- Gunakan Lovable AI Gateway dengan model `openai/gpt-6-astra`, Responses API, streaming, reasoning, run ID, penanganan Stop, serta pesan kesalahan kredit/rate-limit yang aman.
- Gunakan AI SDK tool calling dengan alat awal: `get_profit_summary`, `find_supplier`, `find_products`, `get_purchase_order_history`, dan `create_purchase_order_draft`.
- Perhitungan keuntungan memakai sumber dan rumus yang sama dengan halaman Untung, termasuk filter rentang waktu toko, agar jawaban AI konsisten dengan laporan.
- Gunakan endpoint chat streaming TanStack, endpoint transkripsi `openai/gpt-transcribe`, dan validasi unggahan gambar/audio sebelum diproses.
- Bangun tampilan dengan AI Elements: percakapan, pesan markdown, indikator berpikir, lampiran, kontrol rekam suara, detail alat yang tertutup secara default, kartu konfirmasi PO, tombol Stop, serta fokus input yang tetap nyaman.
- Tambahkan identitas visual khusus Dagang Pintar, metadata halaman yang unik, dan menu pada navigasi pemilik/admin.

## Verifikasi
- Uji akses pemilik berhasil dan akses kasir ditolak pada halaman maupun endpoint.
- Kirim pertanyaan keuntungan dengan rentang tanggal dan cocokkan hasil AI dengan halaman Untung.
- Unggah foto faktur, jawab pertanyaan supplier/produk, tinjau draf, tolak sekali, lalu setujui; pastikan hanya persetujuan yang membuat satu PO Draft tanpa duplikasi.
- Uji rekaman suara nyata, pemulihan chat setelah muat ulang/perangkat baru, lampiran foto privat, Stop saat respons berjalan, dan pesan kegagalan AI.
- Jalankan build, lint, pemeriksaan database/security, serta cek tampilan desktop dan ponsel.
