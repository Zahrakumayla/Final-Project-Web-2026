import { ROLES } from "@/lib/auth/config";

// Matriks hak akses (RBAC). Satu-satunya tempat yang menentukan "siapa boleh apa".
// Dipakai oleh Server Action, Route Handler, dan layout. Menyembunyikan menu saja
// TIDAK cukup, jadi setiap aksi memanggil can()/requirePermission() di server.
const { ADMIN, WAREHOUSE_MANAGER: MANAGER, WAREHOUSE_STAFF: STAFF, SUPPLIER } = ROLES;

export const PERMISSIONS = {
  // Produk & kategori
  PRODUCT_VIEW: [ADMIN, MANAGER, STAFF],
  PRODUCT_MANAGE: [ADMIN, MANAGER],
  CATEGORY_VIEW: [ADMIN, MANAGER],
  CATEGORY_MANAGE: [ADMIN, MANAGER],

  // Supplier
  SUPPLIER_VIEW: [ADMIN, MANAGER],
  SUPPLIER_VERIFY: [ADMIN],

  // Restock / PO
  RESTOCK_CREATE: [MANAGER],
  RESTOCK_VIEW: [MANAGER, SUPPLIER],
  RESTOCK_RESPOND: [SUPPLIER], // konfirmasi / tolak PO + info pengiriman
  RESTOCK_UPDATE_STATUS: [MANAGER], // Confirmed -> In Transit -> Received
  RESTOCK_RATE: [MANAGER],

  // Transaksi barang masuk / keluar
  TRANSACTION_CREATE: [STAFF],
  TRANSACTION_REVIEW: [MANAGER], // approve / reject
  TRANSACTION_VIEW: [MANAGER, STAFF],

  // Pengiriman barang keluar
  SHIPMENT_MANAGE: [STAFF],
  SHIPMENT_VIEW: [MANAGER, STAFF],

  // Laporan masalah
  ISSUE_CREATE: [STAFF, SUPPLIER],
  ISSUE_VIEW: [MANAGER, STAFF, SUPPLIER],
  ISSUE_RESOLVE: [MANAGER], // termasuk meminta barang pengganti / refund dan mengonfirmasinya
  ISSUE_REMEDY_RESPOND: [SUPPLIER], // supplier mengirim pengganti / refund

  // Inventori, laporan, ekspor
  INVENTORY_VIEW: [MANAGER],
  REPORT_VIEW: [MANAGER],
  EXPORT_PRODUCTS: [ADMIN, MANAGER],
  EXPORT_TRANSACTIONS: [MANAGER, STAFF],
  EXPORT_RESTOCK: [ADMIN, MANAGER],
  EXPORT_CATEGORIES: [ADMIN],
  EXPORT_SUPPLIERS: [ADMIN],

  // Semua role
  NOTIFICATION_VIEW: [ADMIN, MANAGER, STAFF, SUPPLIER],
  PROFILE_EDIT: [ADMIN, MANAGER, STAFF, SUPPLIER],
};

export function can(user, permission) {
  return Boolean(user) && (PERMISSIONS[permission] ?? []).includes(user.role);
}

// Halaman utama tiap role. Dipakai untuk redirect setelah login dan saat salah role.
export const ROLE_HOME_PATH = {
  [ADMIN]: "/admin",
  [MANAGER]: "/manager",
  [STAFF]: "/staff",
  [SUPPLIER]: "/supplier",
};

export function getHomePath(role) {
  return ROLE_HOME_PATH[role] ?? "/login";
}
