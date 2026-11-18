# AYVORA - Ayla Innovation Warehouse

Warehouse Management System (WMS) berbasis web untuk distributor perlengkapan dan kemasan F&B ramah lingkungan. Proyek Final Project Praktikum Pemrograman Web 2026.

## Teknologi

| Komponen | Teknologi |
|---|---|
| Framework | Next.js (App Router) |
| Bahasa | JavaScript (JSX) |
| Styling | Tailwind CSS |
| Font | Poppins (`next/font/google`) |
| Database | PostgreSQL + raw SQL *(tahap berikutnya)* |
| Backend | Route Handlers & Server Actions *(tahap berikutnya)* |
| Autentikasi | Better Auth *(tahap berikutnya)* |

## Menjalankan project

```bash
npm install
npm run dev
```

Buka http://localhost:3000.

## Status pengerjaan

- [x] Tahap 1 - Fondasi project dan landing page (Beranda, Tentang Kami)
- [ ] Tahap 2 - Database PostgreSQL, dummy data, autentikasi
- [ ] Tahap 3 - Dashboard Admin, Warehouse Manager, Staff Gudang, Supplier

## Struktur folder

```text
public/            aset statis (logos, images/backgrounds, images/products)
src/
  app/
    layout.jsx     root layout: font Poppins + metadata
    globals.css    token warna (light/dark) + pemetaan ke Tailwind
    (landing)/     halaman publik: layout bersama, Beranda, /about
  components/
    landing/       navbar, hero, about, footer, background
    shared/        komponen kecil yang dipakai ulang (ikon)
  lib/             konstanta dan helper
database/          file .sql (dibuat pada tahap backend, di luar src/app)
```

## Aturan kode

| Elemen | Format | Contoh |
|---|---|---|
| Folder & file | kebab-case | `hero-section.jsx` |
| Komponen React | PascalCase | `HeroSection` |
| Function & variable | camelCase | `handleNavigation` |
| Constant | UPPER_SNAKE_CASE | `NAV_ITEMS` |
| Tabel & kolom database | snake_case | `restock_orders` |

Nama kode memakai Bahasa Inggris, teks antarmuka memakai Bahasa Indonesia.

## Sistem tema

Semua warna didefinisikan sekali di `src/app/globals.css` sebagai CSS variable
(`--background`, `--foreground`, `--primary`, `--secondary`, dst.) lalu dipakai di komponen
lewat nama semantik, misalnya `bg-background text-foreground`. Tidak ada kode hex di JSX.
Dark mode aktif bila `<html>` memiliki class `dark`.

Di layar `lg` ke atas, ukuran memakai satuan desain `--u` (1 unit = 1px pada frame desain 1512px)
sehingga proporsi mengikuti desain referensi, contoh: `lg:text-[length:calc(62.7*var(--u))]`.
