Masalahnya kemungkinan bukan tampilan, tapi fungsi Langganan gagal menemukan tenant karena akses fungsi `current_tenant_id()` baru saja dikunci terlalu ketat. Halaman akhirnya menerima `tenant: null` lalu menampilkan “Toko belum dibuat.”

Rencana perbaikan:
1. Perbaiki akses database untuk helper tenant
   - Tambahkan migration kecil agar role internal backend tetap bisa menjalankan `current_tenant_id()`, `has_role()`, `is_cashier_session()`, `current_tenant_info()`, dan `next_product_code()`.
   - Tetap tidak membuka akses ke anon/public, jadi perbaikan keamanan sebelumnya tetap terjaga.

2. Buat fungsi billing lebih tahan gagal
   - Di `getMyBilling`, baca tenant owner secara langsung dulu untuk akun owner.
   - Pakai `current_tenant_id()` sebagai fallback untuk sesi kasir/khusus.
   - Tangani error query dengan jelas supaya tidak diam-diam jatuh ke “Toko belum dibuat”.

3. Samakan pembuatan pembayaran
   - Di `createMidtransPayment`, pakai resolver tenant yang sama supaya tombol bayar Midtrans tidak gagal “Toko tidak ditemukan”.

4. Verifikasi hasil
   - Pastikan halaman `/langganan#pilih-paket` menampilkan kartu paket, bukan “Toko belum dibuat”.
   - Pastikan tombol paket tetap membuat pembayaran Midtrans dan data tenant terbaca.