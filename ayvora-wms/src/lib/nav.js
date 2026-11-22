import { ROLES } from "@/lib/auth/config";

// Daftar menu sidebar tiap role. Menyembunyikan menu hanyalah kenyamanan;
// akses sebenarnya tetap diperiksa di server (lihat lib/permissions.js).
const common = (base) => [
  { label: "Notifikasi", href: `${base}/notifications`, icon: "bell" },
  { label: "Profil", href: `${base}/profile`, icon: "user" },
];

export const NAV_BY_ROLE = {
  [ROLES.ADMIN]: [
    { label: "Dashboard", href: "/admin", icon: "dashboard", exact: true },
    { label: "Produk", href: "/admin/products", icon: "box" },
    { label: "Kategori", href: "/admin/categories", icon: "tag" },
    { label: "Verifikasi Supplier", href: "/admin/suppliers", icon: "shield" },
    ...common("/admin"),
  ],
  [ROLES.WAREHOUSE_MANAGER]: [
    { label: "Dashboard", href: "/manager", icon: "dashboard", exact: true },
    { label: "Produk", href: "/manager/products", icon: "box" },
    { label: "Kategori", href: "/manager/categories", icon: "tag" },
    { label: "Inventori", href: "/manager/inventory", icon: "warehouse" },
    { label: "Restock (PO)", href: "/manager/restock", icon: "clipboard" },
    { label: "Persetujuan", href: "/manager/transactions", icon: "check" },
    { label: "Pengiriman", href: "/manager/deliveries", icon: "truck" },
    { label: "Laporan Masalah", href: "/manager/issues", icon: "alert" },
    { label: "Supplier", href: "/manager/suppliers", icon: "users" },
    { label: "Laporan", href: "/manager/reports", icon: "chart" },
    ...common("/manager"),
  ],
  [ROLES.WAREHOUSE_STAFF]: [
    { label: "Dashboard", href: "/staff", icon: "dashboard", exact: true },
    { label: "Produk & Lokasi", href: "/staff/products", icon: "box" },
    { label: "Barang Masuk", href: "/staff/incoming", icon: "inbox" },
    { label: "Barang Keluar", href: "/staff/outgoing", icon: "send" },
    { label: "Pengiriman", href: "/staff/deliveries", icon: "truck" },
    { label: "Laporan Masalah", href: "/staff/issues", icon: "alert" },
    ...common("/staff"),
  ],
  [ROLES.SUPPLIER]: [
    { label: "Dashboard", href: "/supplier", icon: "dashboard", exact: true },
    { label: "Pesanan Restock", href: "/supplier/restock", icon: "clipboard" },
    { label: "Riwayat Pesanan", href: "/supplier/history", icon: "history" },
    { label: "Laporan Masalah", href: "/supplier/issues", icon: "alert" },
    ...common("/supplier"),
  ],
};
