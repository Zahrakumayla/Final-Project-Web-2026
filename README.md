# AYVORA – Ayla Innovation Warehouse

**Pengelolaan Gudang Lebih Cerdas, Operasional Bisnis Lebih Efisien.**

AYVORA (Ayla Innovation Warehouse) merupakan sistem manajemen gudang berbasis web (*Warehouse Management System*) yang dirancang untuk membantu distributor perlengkapan dan kemasan F&B ramah lingkungan dalam mengelola aktivitas pergudangan secara terintegrasi, terstruktur, dan efisien.

Proyek ini dikembangkan sebagai bagian dari **Final Project Praktikum Pemrograman Web 2026**.

---

## Tentang AYVORA

Pengelolaan gudang melibatkan berbagai aktivitas, mulai dari pemantauan persediaan barang, pengelolaan supplier, pembuatan pesanan pembelian, pemeriksaan barang masuk, hingga distribusi barang keluar.

AYVORA hadir sebagai platform terintegrasi untuk mempermudah proses tersebut, meningkatkan akurasi pencatatan data, serta mendukung pengambilan keputusan dalam operasional gudang.

Sistem ini memiliki empat jenis pengguna utama:

- **Admin** – Mengelola pengguna, supplier, produk, kategori, dan administrasi sistem.
- **Manager** – Memantau operasional gudang, mengelola pesanan pembelian, menyetujui hasil pemeriksaan, dan mengawasi persediaan.
- **Staff Gudang** – Menangani pemeriksaan barang masuk dan proses barang keluar.
- **Supplier** – Menerima pesanan pembelian, mengelola pemenuhan pesanan, dan mengirimkan informasi pengiriman barang.

---

## Fitur Utama

### 1. Autentikasi dan Hak Akses Pengguna
- Login dan registrasi supplier.
- Hak akses berdasarkan peran pengguna (*Role-Based Access Control*).
- Pemantauan status pendaftaran supplier.
- Pengelolaan sesi pengguna.

### 2. Manajemen Produk dan Kategori
- Pengelolaan informasi produk.
- Pengelompokan produk berdasarkan kategori.
- Pemantauan ketersediaan dan persediaan produk.
- Pengelolaan informasi harga pembelian.

### 3. Manajemen Supplier
- Registrasi dan verifikasi supplier.
- Pengelolaan informasi supplier.
- Pemantauan status akun supplier.

### 4. Manajemen Purchase Order
- Pembuatan dan pengelolaan pesanan pembelian.
- Pengiriman Purchase Order kepada supplier.
- Pemantauan konfirmasi dan pemenuhan pesanan.
- Pelacakan status Purchase Order.

### 5. Manajemen Barang Masuk
- Pencatatan barang masuk.
- Pengunggahan dokumentasi pengiriman.
- Penugasan staff gudang untuk melakukan pemeriksaan.
- Pemeriksaan jumlah dan kondisi barang yang diterima.

### 6. Pemeriksaan Barang dan Klaim
- Pemeriksaan produk yang diterima.
- Pencatatan barang rusak, kurang, atau tidak sesuai.
- Pengelolaan klaim berdasarkan hasil pemeriksaan.
- Pemantauan status pemeriksaan dan klaim.

### 7. Manajemen Barang Keluar
- Pembuatan transaksi barang keluar.
- Pengelolaan alokasi stok.
- Persetujuan dan pemrosesan pesanan keluar.
- Pencatatan jumlah barang yang benar-benar dikirim.

### 8. Manajemen Inventaris
- Pemantauan stok fisik.
- Pelacakan stok yang dialokasikan dan stok tersedia.
- Pencatatan pergerakan stok.
- Riwayat transaksi inventaris.

### 9. Dashboard dan Laporan
- Menampilkan ringkasan operasional gudang.
- Memantau aktivitas pergudangan.
- Melihat riwayat transaksi.
- Membuat laporan dan mengekspor data.

### 10. Notifikasi dan Log Aktivitas
- Menampilkan notifikasi sistem.
- Memantau pembaruan transaksi penting.
- Mencatat aktivitas pengguna.

---

## Alur Sistem

### Alur Barang Masuk

```text
Manager Membuat Purchase Order
              |
              v
Supplier Mengonfirmasi Pesanan
              |
              v
Supplier Mengirim Barang
              |
              v
Informasi Pengiriman Dikirim
              |
              v
Manager Menugaskan Staff Gudang
              |
              v
Staff Memeriksa Barang Masuk
              |
              v
Manager Meninjau Hasil Pemeriksaan
              |
         +----+----+
         |         |
         v         v
     Disetujui  Perlu Klaim
         |         |
         v         v
  Stok Diperbarui  Klaim Diproses
```

### Alur Barang Keluar

```text
Staff Membuat Pesanan Barang Keluar
              |
              v
Manager Meninjau Pesanan
              |
              v
Alokasi Stok
              |
              v
Staff Menyiapkan Barang
              |
              v
Barang Dikirim
              |
              v
Stok Inventaris Diperbarui
```

---

## Teknologi yang Digunakan

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 16 |
| Frontend | React 19 |
| Bahasa Pemrograman | JavaScript (JSX) |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL |
| Koneksi Database | Node.js PostgreSQL (`pg`) |
| Autentikasi | bcryptjs |
| Tipografi | Poppins |
| Arsitektur | Next.js App Router |
| Backend | Route Handlers dan Server Actions |

---

## Database

AYVORA menggunakan PostgreSQL sebagai sistem manajemen basis data relasional.

Database dirancang untuk mendukung berbagai aktivitas pergudangan, meliputi:

- Pengelolaan pengguna dan peran.
- Pengelolaan supplier dan produk.
- Transaksi Purchase Order.
- Barang masuk dan pemeriksaan.
- Pengelolaan klaim.
- Transaksi barang keluar.
- Inventaris dan pergerakan stok.
- Notifikasi dan log aktivitas.

Integritas data didukung melalui relasi antartabel, constraint, trigger, dan pengelolaan transaksi database.

---

## Keamanan Sistem

AYVORA menerapkan beberapa mekanisme keamanan untuk melindungi data dan membatasi akses pengguna, yaitu:

- **Password Hashing:** Password pengguna di-hash menggunakan bcryptjs.
- **Session Management:** Autentikasi menggunakan session cookie.
- **HttpOnly Cookie:** Cookie sesi tidak dapat diakses secara langsung melalui JavaScript pada sisi klien.
- **Role-Based Access Control (RBAC):** Pengguna hanya dapat mengakses fitur sesuai dengan perannya.
- **Server-Side Authorization:** Pemeriksaan hak akses diterapkan pada halaman yang dilindungi dan Server Actions.
- **Database Integrity:** Constraint dan trigger database membantu menjaga konsistensi data.

---

## Struktur Proyek

```text
ayvora/
│
├── database/
│   ├── AYVORA_FINAL_DATABASE.sql
│
├── public/
│   └── images/
│       ├── logo/
│       ├── background/
│       ├── products/
│       └── categories/
│
├── uploads/
│
├── src/
│   ├── app/
│   │   ├── admin/
│   │   ├── manager/
│   │   ├── staff/
│   │   ├── supplier/
│   │   ├── login/
│   │   ├── register/
│   │   └── ...
│   │
│   ├── components/
│   ├── features/
│   ├── actions/
│   ├── services/
│   └── lib/
│
├── proxy.js
├── package.json
├── .env.example
```

---

## Instalasi dan Konfigurasi

Ikuti langkah-langkah berikut untuk menjalankan AYVORA di lingkungan lokal.

### 1. Clone Repository

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
```

Masuk ke direktori proyek:

```bash
cd ayvora
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment Variables

Buat file `.env.local` pada direktori utama proyek.

Salin konfigurasi dari `.env.example`:

```env
DATABASE_URL=postgresql://postgres:GANTI_PASSWORD@localhost:5432/ayvora
```

Ganti `GANTI_PASSWORD` dengan password PostgreSQL yang digunakan.

### 4. Konfigurasi Database

1. Buka PostgreSQL melalui pgAdmin atau aplikasi pengelola PostgreSQL lainnya.
2. Buat database dengan nama `ayvora`.
3. Buka file SQL pada direktori:

```text
database/AYVORA_FINAL_DATABASE.sql
```

4. Jalankan SQL tersebut untuk membuat tabel, relasi, constraint, dan data awal yang dibutuhkan sistem.

### 5. Menjalankan Aplikasi

Jalankan development server:

```bash
npm run dev
```

Buka browser dan akses:

```text
http://localhost:3000
```

---

## Perintah yang Tersedia

| Perintah | Keterangan |
|---|---|
| `npm run dev` | Menjalankan development server |
| `npm run build` | Melakukan proses build aplikasi |
| `npm run start` | Menjalankan aplikasi dalam mode production |

---

## Pengujian Integritas Database

AYVORA menyediakan file pengujian integritas database untuk membantu memeriksa constraint dan konsistensi transaksi pada database.

File pengujian:

```text
database/tests/db-integrity-test.sql
```

Jalankan file tersebut melalui PostgreSQL atau pgAdmin setelah database selesai dikonfigurasi.

---

## Informasi Proyek

| Informasi | Keterangan |
|---|---|
| Nama Proyek | AYVORA – Ayla Innovation Warehouse |
| Jenis Proyek | Sistem Manajemen Gudang Berbasis Web |
| Bidang | Manajemen Gudang dan Inventaris |
| Industri | Distribusi Kemasan F&B Ramah Lingkungan |
| Mata Kuliah | Praktikum Pemrograman Web |
| Tahun Akademik | 2026 |
| Framework | Next.js |
| Database | PostgreSQL |

---

<p align="center">
  <strong>AYVORA – Pengelolaan Gudang Lebih Cerdas, Operasional Bisnis Lebih Efisien.</strong>
  <br>
  Dikembangkan untuk Final Project Praktikum Pemrograman Web 2026.
</p>
