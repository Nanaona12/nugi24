## Kenapa tampilan jelek di HP jadul

Setelah cek kode, ada 3 penyebab utama:

1. **Efek berat berlapis** — `blur-3xl` (blob raksasa), `backdrop-blur-md`, `animate-blob`, `glass/glass-strong`, `hover:-translate-y-1` di banyak card. Semua ini memaksa GPU render layer besar tiap frame. Di HP RAM ≤ 2GB, ini bikin scroll patah-patah dan animasi ngadat.
2. **Warna `oklch()`** — dipakai di semua token warna (`--background`, `--primary`, dll). Browser lama (Safari iOS < 15.4, Chrome Android < 111) tidak support → warna jadi transparan/hitam/putih polos, tampilan hancur.
3. **Landing page padat animasi** — 20+ elemen `animate-fade-in` dengan `animationDelay` bertingkat, blob mengambang, shimmer bar, floating card. Berat di HW low-end.

## Yang akan diperbaiki

### 1. Deteksi & mode ringan otomatis
Tambah class `reduce-fx` di `<html>` ketika:
- `prefers-reduced-motion: reduce`
- `deviceMemory ≤ 2` GB atau `hardwareConcurrency ≤ 4`
- Layar ≤ 360px

Ditulis di `src/start.ts` / inline script `__root.tsx` supaya jalan sebelum paint (tidak flicker).

### 2. CSS fallback di `src/styles.css`
- Tambah fallback `rgb()`/`hsl()` untuk semua token warna via `@supports not (color: oklch(0 0 0))` — supaya HP lama tetap punya warna yang benar.
- Kelas `.reduce-fx`:
  - Nonaktifkan `backdrop-filter` (`bg-background/80` diganti solid)
  - Kecilkan `blur-3xl` → `blur-xl`, atau hilangkan blob di hero
  - Matikan `animate-blob`, `animate-float-slow`, `animate-shimmer-bar`
  - `hover:-translate-y-1`, `transition-all duration-300` → `duration-150` / dimatikan
  - `glass`/`glass-strong` → background solid semi-transparan tanpa blur

### 3. Landing page (`src/routes/index.tsx`)
- Bungkus 3 blob hero dengan `hidden sm:block` supaya mobile tidak render sama sekali.
- Ganti `blur-3xl` jadi `blur-2xl` di mobile, tetap `blur-3xl` di `md:`.
- Hilangkan `animationDelay` bertingkat pada mobile (semua animasi selesai serentak, tidak antre).
- `animate-fade-in` diganti kelas `motion-safe:animate-fade-in` supaya `prefers-reduced-motion` hormat.

### 4. Layout auth (`route.tsx`)
- Header: `backdrop-blur-md` diberi kondisi lewat `.reduce-fx` (solid di HP lemot).

### 5. Ukuran font & tap target mobile kecil
- Tambah breakpoint `xs` (≤ 360px) di `styles.css` — kecilkan padding sidebar/kartu supaya konten tidak terpotong di layar 320px.
- Base font 15px → 14px di layar sangat kecil supaya heading tidak overflow.

### 6. Perf umum
- Tambah `content-visibility: auto` di section landing yang jauh di bawah fold — hemat render awal.
- Tambah `<meta name="theme-color">` sesuai tema supaya address bar seragam.

## Yang TIDAK diubah
- Struktur halaman, komponen, routing, fitur — hanya penampilan & performa.
- Tampilan di HP/laptop modern tetap sama persis (efek glass, blur, animasi tetap jalan).

## Catatan teknis
- Fallback warna generate manual dari nilai `oklch` yang ada (perkiraan RGB dekat), disimpan di blok `@supports not`.
- Deteksi HP lemot pakai script kecil (~500 byte) di `__root.tsx` head, inline supaya no-FOUC.
- Semua perubahan reversible via toggling class `.reduce-fx`.

Setelah plan disetujui, saya implementasi langsung.