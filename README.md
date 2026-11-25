
# AYVORA — Ayla Innovation Warehouse

**Warehouse Management System (WMS)** berbasis web untuk distributor perlengkapan dan kemasan Food & Beverage (F&B) ramah lingkungan.

AYVORA merupakan sistem informasi manajemen gudang yang dirancang untuk mengintegrasikan proses operasional pergudangan, mulai dari pengelolaan produk, pemesanan barang kepada supplier, penerimaan dan pemeriksaan barang, pengelolaan klaim, hingga transaksi barang keluar.

Proyek ini dikembangkan sebagai bagian dari **Final Project Praktikum Pemrograman Web 2026**.

---

## 📌 Daftar Isi

- [Tentang AYVORA](#-tentang-ayvora)
- [Tujuan Pengembangan](#-tujuan-pengembangan)
- [Teknologi](#-teknologi-yang-digunakan)
- [Role dan Hak Akses](#-role-dan-hak-akses)
- [Fitur dan Modul](#-fitur-dan-modul-sistem)
- [Alur Bisnis](#-alur-bisnis-utama)
- [Struktur Folder](#-struktur-folder)
- [Persyaratan Sistem](#-persyaratan-sistem)
- [Instalasi](#-instalasi-dan-menjalankan-project)
- [Konfigurasi Database](#-konfigurasi-database)
- [Aturan Penulisan Kode](#-aturan-penulisan-kode)
- [Sistem Desain](#-sistem-desain-dan-tema)
- [Version Control](#-version-control)
- [Dokumentasi](#-dokumentasi)
- [Status Pengerjaan](#-status-pengerjaan)

---

## 🌱 Tentang AYVORA

AYVORA adalah platform Warehouse Management System yang berfokus pada digitalisasi proses pengelolaan gudang untuk distributor perlengkapan dan kemasan F&B ramah lingkungan.

Sistem ini menyediakan platform terintegrasi bagi Admin, Warehouse Manager, Warehouse Staff, dan Supplier untuk menjalankan aktivitas sesuai tanggung jawab dan hak akses masing-masing.

Melalui AYVORA, proses operasional gudang dapat dikelola secara lebih terstruktur, transparan, dan terdokumentasi.

### Tujuan Pengembangan

- Mengintegrasikan proses pengelolaan persediaan dalam satu sistem.
- Mempermudah pengelolaan produk, kategori, dan lokasi penyimpanan.
- Mendigitalisasi proses pemesanan barang kepada supplier.
- Memastikan penerimaan dan pemeriksaan barang tercatat dengan baik.
- Memfasilitasi pengelolaan klaim atas barang bermasalah.
- Mengontrol transaksi barang keluar melalui mekanisme alokasi stok dan persetujuan.
- Menyediakan riwayat transaksi dan aktivitas sistem.

---

## 🛠️ Teknologi yang Digunakan

| Komponen | Teknologi |
|---|---|
| Framework | Next.js (App Router) |
| Bahasa Pemrograman | JavaScript (JSX) |
| Styling | Tailwind CSS |
| Font | Poppins (`next/font/google`) |
| Database | PostgreSQL |
| Database Driver | `pg` |
| Backend | Route Handlers & Server Actions |
| Autentikasi | bcryptjs |
| Session Management | Cookie HttpOnly |
| Database Query | Raw SQL |
| Version Control | Git & GitHub |

### Arsitektur Aplikasi

AYVORA menggunakan Next.js App Router sebagai fondasi pengembangan aplikasi.

Pengelolaan data dilakukan melalui PostgreSQL menggunakan raw SQL dengan bantuan package `pg`. Proses backend memanfaatkan Route Handlers dan Server Actions untuk menangani komunikasi antara antarmuka aplikasi dan database.

Sistem autentikasi menggunakan bcryptjs untuk hashing password serta session berbasis cookie HttpOnly yang dikelola melalui tabel `sessions`.

---

## 👥 Role dan Hak Akses

AYVORA memiliki empat jenis pengguna dengan tanggung jawab dan hak akses berbeda.

### 1. Admin
- Mengelola akun dan pengguna sistem.
- Mengelola pendaftaran dan verifikasi supplier.
- Mengelola produk dan kategori.
- Mengelola informasi harga beli produk.
- Memantau seluruh modul secara read-only.
- Melihat log aktivitas sistem.

### 2. Warehouse Manager
- Mengelola produk dan kategori.
- Mengelola Purchase Order (PO).
- Memantau pengiriman dan penerimaan barang.
- Meninjau hasil pemeriksaan barang.
- Menyetujui dan menindaklanjuti laporan pemeriksaan.
- Menentukan penyelesaian klaim.
- Menyetujui transaksi barang keluar.
- Memantau persediaan dan aktivitas gudang.

### 3. Warehouse Staff
- Melakukan pemeriksaan barang masuk.
- Mengisi laporan hasil pemeriksaan.
- Mencatat kondisi dan jumlah barang.
- Mengajukan transaksi barang keluar.
- Mempersiapkan barang setelah mendapat persetujuan.
- Memantau status transaksi dan aktivitas gudang.

### 4. Supplier
- Melakukan registrasi akun.
- Melengkapi informasi perusahaan dan website.
- Memantau status verifikasi pendaftaran.
- Mengajukan ulang pendaftaran jika ditolak.
- Melihat Purchase Order.
- Memproses pesanan barang.
- Mengelola informasi pengiriman.
- Mengunggah bukti dan foto kondisi barang saat tiba.

---

## 📦 Fitur dan Modul Sistem

### 1. Product & Inventory Management
- Pengelolaan produk dan kategori.
- Informasi kode produk dan satuan.
- Pengaturan harga dan batas stok.
- Informasi stok acuan.
- Pemantauan ketersediaan barang.
- Pengelolaan lokasi penyimpanan.
- Pengarsipan produk yang memiliki riwayat transaksi.

### 2. Purchase Order Management
- Pembuatan Purchase Order.
- Pengelolaan pesanan barang kepada supplier.
- Perhitungan harga PO secara otomatis.
- Penomoran PO otomatis.
- Pemantauan status pesanan.

### 3. Incoming Goods Management
- Pencatatan penerimaan barang.
- Informasi pengiriman dari supplier.
- Unggah foto kondisi barang saat tiba.
- Pemeriksaan barang oleh staff yang ditunjuk.
- Persetujuan hasil pemeriksaan oleh Manager.

### 4. Inspection Management
- Pencatatan hasil pemeriksaan barang.
- Pemeriksaan kesesuaian jumlah barang.
- Pelaporan barang kurang.
- Pelaporan barang rusak.
- Riwayat hasil pemeriksaan.

### 5. Claim Management
- Pengelolaan klaim barang bermasalah.
- Penyelesaian melalui barang pengganti.
- Penyelesaian melalui refund.
- Pencatatan dan pemantauan status klaim.

### 6. Outgoing Goods Management
- Pengajuan barang keluar oleh Staff.
- Validasi ketersediaan stok.
- Persetujuan transaksi oleh Manager.
- Alokasi stok untuk pengajuan yang disetujui.
- Persiapan dan pengiriman barang.
- Riwayat transaksi barang keluar.

### 7. User Management & System Activity
- Pengelolaan pengguna.
- Verifikasi pendaftaran supplier.
- Pemantauan aktivitas pengguna.
- Riwayat aktivitas sistem.
- Pemantauan seluruh modul oleh Admin.

---

## 🔄 Alur Bisnis Utama

### 1. Alur Barang Masuk

1. Manager membuat Purchase Order.
2. Supplier menerima dan memproses pesanan.
3. Supplier melakukan pengiriman barang.
4. Supplier mengunggah informasi dan foto kondisi barang saat tiba.
5. Warehouse Staff yang ditunjuk melakukan pemeriksaan.
6. Staff mengisi laporan hasil pemeriksaan.
7. Manager meninjau dan menyetujui hasil pemeriksaan.
8. Barang diproses sesuai hasil pemeriksaan dan keputusan Manager.

### 2. Alur Pemeriksaan dan Klaim

1. Staff melakukan pemeriksaan barang.
2. Staff melaporkan ketidaksesuaian atau kerusakan jika ditemukan.
3. Manager meninjau laporan pemeriksaan.
4. Manager menentukan penyelesaian melalui refund atau barang pengganti.
5. Sistem membuat dan mengelola klaim sesuai keputusan.
6. Proses klaim dapat dipantau melalui modul Klaim.

### 3. Alur Barang Keluar

1. Staff mengajukan transaksi barang keluar.
2. Sistem memeriksa ketersediaan stok.
3. Pengajuan menunggu persetujuan Manager.
4. Manager meninjau pengajuan.
5. Setelah disetujui, stok dialokasikan.
6. Staff mempersiapkan barang.
7. Barang dikirim.
8. Sistem memperbarui stok dan status transaksi.

---

## 📁 Struktur Folder

```text
AYVORA/
│
├── public/
│   ├── logos/
│   └── images/
│       ├── backgrounds/
│       └── products/
│
├── src/
│   ├── app/
│   │   ├── layout.jsx
│   │   ├── globals.css
│   │   └── (landing)/
│   │
│   ├── components/
│   │   ├── landing/
│   │   │   ├── navbar/
│   │   │   ├── hero/
│   │   │   ├── about/
│   │   │   ├── footer/
│   │   │   └── background/
│   │   │
│   │   └── shared/
│   │
│   └── lib/
│       └── constants and helpers
│
├── database/
│   ├── AYVORA_FINAL_DATABASE.sql
│   └── tests/
│       └── db-integrity-test.sql
│
├── docs/
│   ├── architecture.md
│   └── auth.md
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

*Catatan: Struktur di atas merupakan gambaran direktori utama. Folder dan file implementasi lainnya mengikuti pengembangan aplikasi.*

---

## 💻 Persyaratan Sistem

Pastikan perangkat telah memiliki:

- Node.js
- npm
- PostgreSQL
- pgAdmin 4 (opsional)
- Git
- Browser modern

---

## 🚀 Instalasi dan Menjalankan Project

### 1. Clone Repository

```bash
git clone <REPOSITORY_URL>
cd <PROJECT_FOLDER>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment

Salin `.env.example` menjadi `.env.local`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Isi konfigurasi database pada `.env.local`.

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ayvora
```

Sesuaikan username dan password dengan konfigurasi PostgreSQL masing-masing.

### 4. Membuat Database

Buat database dengan nama `ayvora`.

```bash
createdb ayvora
```

Alternatifnya, database dapat dibuat melalui pgAdmin 4.

### 5. Import Database

Jalankan file SQL utama:

```bash
psql -d ayvora -f database/AYVORA_FINAL_DATABASE.sql
```

### 6. Database Integrity Test (Opsional)

```bash
psql -d ayvora -f database/tests/db-integrity-test.sql
```

Pengujian mencakup 93 uji aturan bisnis dan seluruh perubahan pengujian otomatis di-rollback.

### 7. Jalankan Aplikasi

```bash
npm run dev
```

Buka browser:

```text
http://localhost:3000
```

---

## 🗄️ Konfigurasi Database

AYVORA menggunakan PostgreSQL sebagai sistem manajemen basis data relasional.

Struktur database dikelola melalui:

```text
database/
├── AYVORA_FINAL_DATABASE.sql
└── tests/
    └── db-integrity-test.sql
```

### Perhatian: Perubahan Skema Database

Pada Tahap 4, skema database mengalami perubahan menyeluruh.

Database versi sebelumnya tidak kompatibel dengan skema terbaru.

Jika menggunakan database lama, lakukan backup data jika diperlukan, kemudian buat ulang database sebelum menjalankan versi terbaru.

```bash
dropdb ayvora
createdb ayvora
psql -d ayvora -f database/AYVORA_FINAL_DATABASE.sql
```

**Peringatan:** Perintah `dropdb` akan menghapus seluruh database beserta datanya. Gunakan hanya pada lingkungan pengembangan yang siap dibuat ulang.

### Akun Demo

Informasi akun demo untuk setiap role tersedia pada bagian header file:

```text
database/AYVORA_FINAL_DATABASE.sql
```

Gunakan kredensial yang tercantum di dalam file tersebut untuk mengakses aplikasi.

---

## 📝 Aturan Penulisan Kode

Untuk menjaga konsistensi dan keterbacaan kode, AYVORA menggunakan standar penamaan berikut.

| Elemen | Format | Contoh |
|---|---|---|
| Folder & file | kebab-case | `hero-section.jsx` |
| Komponen React | PascalCase | `HeroSection` |
| Function | camelCase | `handleNavigation` |
| Variable | camelCase | `selectedProduct` |
| Constant | UPPER_SNAKE_CASE | `NAV_ITEMS` |
| Tabel database | snake_case | `restock_orders` |
| Kolom database | snake_case | `created_at` |

### Ketentuan Bahasa
- Nama kode menggunakan Bahasa Inggris.
- Teks antarmuka menggunakan Bahasa Indonesia.
- Penamaan tabel dan kolom database menggunakan snake_case.
- Gunakan kembali komponen yang sudah tersedia.
- Hindari duplikasi fungsi dan komponen.

---

## 🎨 Sistem Desain dan Tema

AYVORA menggunakan sistem desain terpusat agar seluruh halaman memiliki tampilan yang konsisten.

### Font
Font utama menggunakan Poppins melalui `next/font/google` pada root layout.

### Color System

Seluruh warna didefinisikan melalui CSS Variables pada:

```text
src/app/globals.css
```

Variabel utama:

```css
--background
--foreground
--primary
--secondary
```

Penggunaan warna pada JSX dilakukan melalui nama semantik Tailwind.

Contoh:

```jsx
<div className="bg-background text-foreground">
  ...
</div>
```

Ketentuan:
- Tidak menggunakan kode hex secara langsung di JSX.
- Gunakan CSS Variables sebagai sumber warna utama.
- Hindari mendefinisikan warna yang sama berulang kali.

### Dark Mode

Dark mode aktif apabila elemen `<html>` memiliki class `dark`.

```html
<html class="dark">
```

Seluruh komponen harus mengikuti token warna agar tampilan tetap konsisten.

### Responsive Design

AYVORA mendukung penggunaan melalui laptop dan perangkat mobile.

Pada layar `lg` ke atas, ukuran elemen menggunakan satuan desain `--u`.

Ketentuan:
- 1 unit = 1px pada frame desain 1512px.
- Proporsi elemen mengikuti ukuran referensi.
- Gunakan perhitungan berbasis CSS Variables.

Contoh:

```css
lg:text-[length:calc(62.7*var(--u))]
```

Navigasi, sidebar, tabel, form, dan komponen lainnya harus menyesuaikan ukuran layar.

---

## 🔀 Version Control

Pengembangan AYVORA menggunakan Git dan GitHub untuk pengelolaan source code serta riwayat perubahan.

Setiap perubahan dicatat melalui commit yang menggambarkan tujuan perubahan.

| Prefix | Penggunaan |
|---|---|
| `feat` | Penambahan fitur |
| `fix` | Perbaikan bug |
| `ref` | Refactoring kode |
| `chore` | Pemeliharaan dan konfigurasi |
| `docs` | Perubahan dokumentasi |
| `style` | Perubahan styling |

Contoh:

```bash
git add .
git commit -m "feat: add supplier registration"
git push origin main
```

Usahakan setiap commit berisi perubahan yang saling berkaitan agar riwayat pengembangan mudah ditelusuri.

---

## 📚 Dokumentasi

Dokumentasi teknis tambahan tersedia pada direktori `docs/`.

| File | Deskripsi |
|---|---|
| `docs/architecture.md` | Arsitektur aplikasi dan struktur sistem |
| `docs/auth.md` | Autentikasi dan pengelolaan session |

Dokumentasi database:

- `database/AYVORA_FINAL_DATABASE.sql`
- `database/tests/db-integrity-test.sql`

---

## 📊 Status Pengerjaan

Pengembangan AYVORA dilakukan secara bertahap melalui beberapa tahapan.

| Tahap | Pengembangan | Status |
|---|---|---|
| Tahap 1 | Fondasi project dan landing page | ✅ Selesai |
| Tahap 2 | Autentikasi dan registrasi supplier | ✅ Selesai |
| Tahap 3 | Dashboard dan modul empat role | ✅ Selesai |
| Tahap 4 | Penyesuaian database dan flow bisnis | ✅ Selesai |
| Tahap 5 | Penyempurnaan alur dan hak akses (v3) | ✅ Selesai |
| Tahap 6 | Penyesuaian produk, supplier, dan tampilan | ✅ Selesai |
| Tahap 7 | Revisi hak akses dan responsivitas | ✅ Selesai |
| Tahap 8 | Status pendaftaran supplier dan pengajuan ulang | ✅ Selesai |

### Riwayat Pengembangan

**Tahap 1 — Fondasi Project**
- Inisialisasi project Next.js.
- Landing page.
- Halaman Beranda dan Tentang Kami.

**Tahap 2 — Authentication**
- Login.
- Registrasi supplier.
- Pengelolaan session.
- Logout.

**Tahap 3 — Dashboard**
- Dashboard empat role.
- Modul sesuai hak akses masing-masing pengguna.

**Tahap 4 — Flow Bisnis**
- Penyesuaian skema database.
- PO berharga.
- Pengiriman dan foto barang tiba oleh Supplier.
- Pemeriksaan oleh Staff yang ditunjuk.
- Persetujuan Manager.
- Mekanisme klaim.
- Barang keluar dengan alokasi stok.
- Manajemen pengguna dan aktivitas sistem.

**Tahap 5 — Penyempurnaan Sistem (v3)**
- Perbaikan laporan pemeriksaan barang kurang.
- Keputusan refund atau barang pengganti oleh Manager.
- Integrasi klaim otomatis.
- Notifikasi otomatis terbaca saat halaman terkait dibuka.
- Pengelolaan produk dan kategori.
- Validasi nama kategori unik.
- Penghapusan kategori hanya jika stok 0.
- Pembuatan PO dari detail produk dengan stok rendah.
- Stok acuan pada form produk.
- Validasi gambar, harga, batas stok, dan satuan.
- Filter tipe, tanggal, dan status pengiriman.
- Nomor PO dan transaksi keluar otomatis.
- Pencatatan tanggal order, laporan, dan pengiriman.
- Penghapusan PO Pending oleh Manager.
- Penghapusan pengajuan barang keluar Pending milik sendiri oleh Staff.
- Admin memantau seluruh modul secara read-only.
- Log aktivitas seed ditampilkan.

**Tahap 6 — Revisi 24 November 2026**
- Pengelolaan produk dan harga beli hanya oleh Admin.
- Penghapusan fitur rating supplier dan sanggahan klaim.
- Penambahan informasi website supplier saat registrasi.
- Password wajib menggunakan simbol.
- Penyesuaian Bahasa Indonesia.
- Penyederhanaan tampilan.

**Tahap 7 — Revisi 25 November 2026**
- Supplier hanya untuk Admin.
- Harga PO otomatis.
- Pesan penolakan untuk supplier.
- Penyederhanaan tampilan.
- Perbaikan responsivitas menu.

**Tahap 8 — Supplier Registration**
- Halaman status pendaftaran supplier.
- Status menunggu verifikasi dan ditolak.
- Fitur pengajuan ulang setelah penolakan.
- Penyesuaian landing page dan login pada tampilan laptop.

---

## 📌 Informasi Proyek

| Informasi | Keterangan |
|---|---|
| Nama Proyek | AYVORA — Ayla Innovation Warehouse |
| Jenis Aplikasi | Warehouse Management System |
| Platform | Web Application |
| Framework | Next.js |
| Database | PostgreSQL |
| Mata Kuliah | Praktikum Pemrograman Web |
| Periode | 2026 |
| Status | Tahap 1–8 Selesai |

---

**AYVORA — Manage Your Warehouse, Smarter.**
