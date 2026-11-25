
# 📦 AYVORA — Ayla Innovation Warehouse

**Pengelolaan Gudang Lebih Cerdas, Operasional Bisnis Lebih Efisien.**

AYVORA (Ayla Innovation Warehouse) merupakan sistem manajemen gudang berbasis web (*Warehouse Management System*) yang dirancang untuk membantu distributor perlengkapan dan kemasan F&B ramah lingkungan dalam mengelola aktivitas pergudangan secara terintegrasi, terstruktur, dan efisien.

AYVORA membantu pengelolaan persediaan barang, transaksi barang masuk dan keluar, data supplier serta aktivitas operasional gudang melalui satu platform.

> 📌 Project ini dibuat sebagai bagian dari Final Project Praktikum Pemrograman Web 2026.

---

## 📱 Fitur Utama

- 📊 **Dashboard** — Menampilkan informasi dan aktivitas operasional gudang.
- 📦 **Product Management** — Mengelola data produk dan kategori barang.
- 📥 **Stock In** — Mengelola transaksi penerimaan barang dari supplier.
- 📤 **Stock Out** — Mengelola transaksi pengeluaran barang kepada customer.
- 📋 **Inventory Management** — Memantau jumlah dan ketersediaan stok barang.
- 🏢 **Supplier Management** — Mengelola informasi supplier.
- 🔄 **Transaction Management** — Menampilkan riwayat transaksi barang masuk dan keluar.
- ⚠️ **Claim Management** — Mengelola klaim barang rusak, barang kurang, dan ketidaksesuaian barang.
- 🔐 **Authentication & Authorization** — Mengatur autentikasi dan hak akses pengguna berdasarkan role.
- 👤 **Multi-Role Access** — Mendukung akses Warehouse Manager, Staff Gudang, Supplier dan Admin.

---

## 🧪 Teknologi yang Digunakan

| Komponen | Teknologi |
|---|---|
| Framework | Next.js (App Router) |
| Bahasa Pemrograman | JavaScript (JSX) |
| Database | PostgreSQL |
| Styling | Tailwind CSS |
| Runtime | Node.js |
| Version Control | Git & GitHub |

---

## 🗄️ Database

AYVORA menggunakan **PostgreSQL** sebagai sistem manajemen basis data untuk menyimpan dan mengelola seluruh data operasional gudang.

Database dirancang untuk mendukung pengelolaan:

- Data pengguna dan hak akses (*User & Role Management*).
- Data produk dan kategori (*Product Management*).
- Data supplier.
- Data customer.
- Data persediaan barang (*Inventory Management*).
- Transaksi barang masuk (*Stock In*).
- Transaksi barang keluar (*Stock Out*).
- Riwayat transaksi (*Transaction History*).
- Data klaim barang (*Claim Management*).

### Import Database

Untuk menggunakan database AYVORA, ikuti langkah berikut:

1. Pastikan PostgreSQL sudah terinstal.
2. Buat database baru melalui PostgreSQL atau pgAdmin.
3. Buka file `AYVORA_FINAL_DATABASE9.sql`.
4. Jalankan script SQL tersebut pada database yang telah dibuat.
5. Pastikan tabel, relasi, constraint, dan data awal berhasil dibuat.

---

## 🔧 Cara Menggunakan Aplikasi

1. **Login Pengguna**

   Pengguna masuk menggunakan akun yang telah terdaftar sesuai dengan role masing-masing.

2. **Dashboard**

   Halaman utama menampilkan informasi dan aktivitas gudang berdasarkan hak akses pengguna.

3. **Manajemen Produk**

   Pengguna yang memiliki hak akses dapat mengelola data produk, kategori, dan informasi persediaan barang.

4. **Manajemen Barang Masuk**

   Staff Gudang dapat mengelola transaksi penerimaan barang dari supplier.

5. **Manajemen Barang Keluar**

   Staff Gudang dapat mengelola transaksi pengeluaran barang berdasarkan pesanan customer.

6. **Transaction Management**

   Menampilkan riwayat transaksi barang masuk dan keluar, lengkap dengan informasi tanggal, tipe transaksi, dan status.

7. **Claim Management**

   Mengelola klaim terkait barang rusak, barang kurang, atau ketidaksesuaian barang yang diterima.

8. **Supplier & Customer Management**

   Mengelola informasi supplier dan customer yang terlibat dalam aktivitas operasional gudang.

---

## 📦 Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Konfigurasi Environment Variables

Buat file `.env.local` pada direktori utama proyek dan sesuaikan konfigurasi koneksi database PostgreSQL.

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/NAMA_DATABASE"
```

Sesuaikan `USERNAME`, `PASSWORD`, dan `NAMA_DATABASE` dengan konfigurasi PostgreSQL masing-masing.

### 4. Import Database

Import file `AYVORA_FINAL_DATABASE9.sql` ke database PostgreSQL yang telah dibuat.

### 5. Jalankan Aplikasi

```bash
npm run dev
```

### 6. Akses Aplikasi

Buka browser dan akses alamat berikut:

```text
http://localhost:3000
```

---

## 🔗 Link GitHub

Repository: [AYVORA — Ayla Innovation Warehouse](https://github.com/USERNAME/REPOSITORY)

---

**AYVORA — Pengelolaan Gudang Lebih Cerdas, Operasional Bisnis Lebih Efisien.**
