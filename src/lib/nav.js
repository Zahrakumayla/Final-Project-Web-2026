import { ROLES } from "@/lib/auth/config";

// Daftar menu sidebar tiap role. Menyembunyikan menu hanyalah kenyamanan;
// akses sebenarnya tetap diperiksa di server (lihat lib/permissions.js).
//
// Item bisa berupa tautan biasa { label, href, icon, exact? } atau grup dropdown
// { label, icon, children: [tautan, ...] }.
// Notifikasi (ikon lonceng) dan Profil (menu pengguna) ada di header kanan atas,
// jadi tidak diulang di sidebar.

export const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { label: "Beranda", href: "/admin", icon: "dashboard", exact: true },
    { label: "Pengguna", href: "/admin/users", icon: "users" },
    { label: "Verifikasi Supplier", href: "/admin/suppliers", icon: "shield" },
    { label: "Produk", href: "/admin/products", icon: "box" },
    { label: "Kategori", href: "/admin/categories", icon: "tag" },
    {
      label: "Pantau Pengadaan",
      icon: "inbox",
      children: [
        { label: "Pesanan Pembelian (PO)", href: "/admin/restock", icon: "clipboard" },
        { label: "Pengiriman Masuk", href: "/admin/shipments", icon: "truck" },
        { label: "Pemeriksaan", href: "/admin/inspections", icon: "check" },
        { label: "Klaim", href: "/admin/claims", icon: "alert" },
      ],
    },
    { label: "Pengiriman Keluar", href: "/admin/outgoing", icon: "send" },
    { label: "Inventori", href: "/admin/inventory", icon: "warehouse" },
    { label: "Laporan", href: "/admin/reports", icon: "chart" },
    { label: "Aktivitas Sistem", href: "/admin/activity", icon: "history" },
  ],
  [ROLES.WAREHOUSE_MANAGER]: [
    { label: "Beranda", href: "/manager", icon: "dashboard", exact: true },
    {
      label: "Pengadaan",
      icon: "inbox",
      children: [
        { label: "Pesanan Pembelian (PO)", href: "/manager/restock", icon: "clipboard" },
        { label: "Pengiriman Masuk", href: "/manager/shipments", icon: "truck" },
        { label: "Pemeriksaan", href: "/manager/inspections", icon: "check" },
        { label: "Klaim", href: "/manager/claims", icon: "alert" },
      ],
    },
    { label: "Pengiriman Keluar", href: "/manager/outgoing", icon: "send" },
    {
      label: "Persediaan",
      icon: "package",
      children: [
        { label: "Inventori", href: "/manager/inventory", icon: "warehouse" },
        { label: "Produk", href: "/manager/products", icon: "box" },
        { label: "Kategori", href: "/manager/categories", icon: "tag" },
      ],
    },
    { label: "Laporan", href: "/manager/reports", icon: "chart" },
    { label: "Aktivitas Gudang", href: "/manager/activity", icon: "history" },
  ],
  [ROLES.WAREHOUSE_STAFF]: [
    { label: "Beranda", href: "/staff", icon: "dashboard", exact: true },
    { label: "Tugas Pemeriksaan", href: "/staff/inspections", icon: "check" },
    { label: "Barang Keluar", href: "/staff/outgoing", icon: "send" },
    { label: "Produk & Lokasi", href: "/staff/products", icon: "box" },
    { label: "Aktivitas Gudang", href: "/staff/activity", icon: "history" },
  ],
  [ROLES.SUPPLIER]: [
    { label: "Beranda", href: "/supplier", icon: "dashboard", exact: true },
    { label: "Pesanan (PO)", href: "/supplier/restock", icon: "clipboard" },
    { label: "Klaim", href: "/supplier/claims", icon: "alert" },
    { label: "Riwayat Transaksi", href: "/supplier/history", icon: "history" },
  ],
};
