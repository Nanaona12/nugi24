# Backup MySQL — Dagang Pintar

Memerlukan Python 3.10+, MySQL 8.0+, internet, dan komputer menyala. VS Code untuk membuka folder dan membaca MySQL dengan ekstensi koneksi MySQL. Ini cadangan bisnis JSON berversi, bukan pengganti database aplikasi. Foto/file asli tidak disalin: hanya keterangan dan referensi file yang tersedia. Data yang dihapus sebelum jurnal diaktifkan tidak dapat dipulihkan.

## Pemasangan di Windows / VS Code
1. Ekstrak ZIP ke folder pribadi. Jangan unggah folder ini ke Git/GitHub.
2. Buka folder di VS Code. Terminal: `py -m venv .venv`, lalu `.venv\Scripts\python -m pip install -r requirements.txt`.
3. Buka MySQL sebagai administrator lokal; jalankan `schema.sql`.
4. Buat akun MySQL khusus `backup_sync` dengan password kuat pilihan sendiri. Berikan HANYA SELECT dan INSERT pada `dagangpintar_backup.backup_history` seperti komentar di schema.sql. Jangan gunakan root untuk sinkron.
5. Terminal: `.venv\Scripts\python sync.py --setup https://www.dagangpintar.app` (gunakan alamat aplikasi yang sudah memuat fitur Backup MySQL).
6. Buka `pairing.json`. Salin isi ke halaman Backup Data → Backup MySQL, beri nama komputer, lalu Setujui Perangkat. Pairing berisi kunci publik, bukan password. JANGAN bagikan `.device.json`: file itu berisi kunci privat dan izin backup; lindungi folder dengan izin Windows hanya untuk akun Anda.
7. Di PowerShell, atur untuk sesi terminal: `$env:MYSQL_USER='backup_sync'`, `$env:MYSQL_PASSWORD=Read-Host 'Password MySQL'` (input tidak menyembunyikan ketikan; alternatif set lewat pengelola kredensial Anda), `$env:MYSQL_DATABASE='dagangpintar_backup'`. MYSQL_HOST default 127.0.0.1, MYSQL_PORT default 3306. Jangan menaruh password di source/Git.
8. Jalankan `.venv\Scripts\python sync.py`. Biarkan berjalan: setiap 60 detik menarik data baru; koneksi gagal dicoba ulang. `--once` untuk sekali sinkron. Tutup dengan Ctrl+C.

## Otomatis setelah komputer menyala
Windows Task Scheduler: buat tugas pada login, jalankan Python di `.venv\Scripts\python.exe` dengan argumen `sync.py`, Start in folder paket. Pastikan tugas berjalan sebagai akun Anda, memiliki MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE melalui pengaturan lingkungan lokal aman Anda, dan MySQL sudah aktif. Jangan menaruh password dalam argumen tugas. macOS/Linux: gunakan cron atau service pengguna dengan variabel lingkungan lokal dan `python sync.py --once` tiap menit; hindari dua proses serentak.

## Membaca di VS Code / MySQL
Hubungkan ekstensi MySQL ke komputer lokal. `SELECT * FROM riwayat_transaksi ORDER BY seq DESC LIMIT 100;` atau `detail_struk`, `riwayat_po`, `riwayat_pembukuan`. Kolom payload memuat data versi tersebut; previous_payload menyimpan versi sebelum perubahan. operation delete adalah catatan penghapusan di aplikasi, BUKAN penghapusan backup. Untuk melihat semua versi: `SELECT * FROM backup_history WHERE record_id='ID_BARIS' ORDER BY seq;`.

## Riwayat permanen dan keamanan
Program hanya SELECT/INSERT. Semua versi dan catatan penghapusan tetap tersimpan. Jurnal Cloud menampung perubahan saat PC mati. Tidak ada password/PIN aplikasi dalam payload. Kredensial MySQL tidak dikirim ke aplikasi. Jika perangkat hilang, cabut aksesnya di halaman Backup MySQL; salinan lokal tetap ada.
Pemilik akun root/administrator komputer tetap dapat menghapus database secara manual: tidak ada program yang dapat mencegahnya. Simpan cadangan MySQL lokal tambahan secara rutin ke disk eksternal terenkripsi. Jangan hapus .device.json kecuali sengaja mengganti perangkat. Jangan campurkan dua toko dalam satu database backup.
