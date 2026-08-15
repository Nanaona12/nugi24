# Shift tetap terbaca di semua device

## Kenapa terjadi

Status "shift sedang buka" saat ini hanya disimpan di penyimpanan lokal browser (`dp.active_shift` di localStorage), bukan dibaca dari database. Jadi:

- Device A buka shift → status tersimpan di device A saja.
- Device C dibuka → tidak ada data lokal → aplikasi menganggap belum ada shift → muncul dialog "Buka Shift / Saldo Awal Kas".
- Device B kelihatan normal hanya karena kebetulan pernah menyimpan status shift sebelumnya.

Shift-nya sendiri sebenarnya sudah tercatat di database (`cashier_shifts` dengan status `open`), jadi datanya tidak hilang — hanya tampilan tiap device yang tidak sinkron.

## Yang akan diperbaiki

1. Saat halaman Kasir dibuka di device mana pun, aplikasi mengecek dulu ke server: apakah kasir ini punya shift yang masih `open`?
   - Kalau ada → langsung masuk mode berjualan memakai shift yang sama (tidak minta saldo awal kas lagi, dan saldo awal ditampilkan sesuai yang diinput di device pertama).
   - Kalau tidak ada → baru muncul dialog buka shift seperti sekarang.
2. Kalau shift ternyata sudah ditutup dari device lain, device yang masih menyimpan status lama akan otomatis membersihkan statusnya dan kembali ke layar buka shift, supaya tidak ada transaksi yang masuk ke shift yang sudah tutup.
3. Status shift lokal tetap dipakai sebagai cadangan agar tampilan tidak berkedip saat loading, tapi selalu dikoreksi oleh data server.

## Detail teknis

- Tambah server function `getMyOpenShift` di `src/lib/cashier.functions.ts` (pakai `requireSupabaseAuth`, scoped tenant) yang mengembalikan shift `status = 'open'` beserta `opening_cash`, `opened_at`, dan nama kasir:
  - untuk sesi kasir (login kode kasir): cari shift open milik kasir yang tersimpan di `dp.active_cashier`, atau shift open pada tenant bila belum ada kasir aktif tersimpan.
  - untuk owner/admin: kembalikan shift open pada tenant tersebut.
- Di `src/routes/_authenticated/kasir.tsx`:
  - `useEffect` saat mount memanggil `getMyOpenShift`, lalu `persistShift(...)` bila ada, dan `persistShift(null)` bila shift lokal sudah tidak ada di server.
  - `openingDialogOpen` dan `lockOpen` baru ditentukan setelah pengecekan server selesai (pakai flag `shiftChecked`) agar dialog "Saldo Awal Kas" tidak sempat muncul di device baru.
- Tidak ada perubahan skema database.
