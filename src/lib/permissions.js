import { ROLES } from "@/lib/auth/config";

// Matriks hak akses (RBAC). Satu-satunya tempat yang menentukan "siapa boleh apa".
// Dipakai oleh Server Action, Route Handler, dan layout. Menyembunyikan menu saja
// TIDAK cukup, jadi setiap aksi memanggil can()/requirePermission() di server.
// Aturan alur (urutan status, stok) dijaga lagi oleh trigger database.
const { ADMIN, WAREHOUSE_MANAGER: MANAGER, WAREHOUSE_STAFF: STAFF, SUPPLIER } = ROLES;

export const PERMISSIONS = {
  // Data master: produk hanya Admin; kategori Admin dan Manager; Staff hanya melihat
  PRODUCT_VIEW: [ADMIN, MANAGER, STAFF],
  PRODUCT_MANAGE: [ADMIN], // hanya Admin: harga beli mengikuti kontrak supplier, hanya Admin yang boleh mengubah
  CATEGORY_VIEW: [ADMIN, MANAGER],
  CATEGORY_MANAGE: [ADMIN, MANAGER],

  // Pengguna & aktivitas
  USER_MANAGE: [ADMIN], // buat, nonaktifkan, reset password Manager & Staff
  ACTIVITY_VIEW_ALL: [ADMIN],
  ACTIVITY_VIEW_WAREHOUSE: [MANAGER, STAFF],

  // Supplier
  SUPPLIER_VIEW: [ADMIN],
  SUPPLIER_VERIFY: [ADMIN],

  // Admin: melihat (hanya baca) seluruh modul operasional. Aksi tetap milik role masing-masing.
  // Purchase Order
  RESTOCK_CREATE: [MANAGER],
  RESTOCK_VIEW: [ADMIN, MANAGER, SUPPLIER],
  RESTOCK_RESPOND: [SUPPLIER], // konfirmasi / tolak PO
  RESTOCK_DELETE: [MANAGER], // hanya PO berstatus Pending

  // Pengiriman barang masuk
  INBOUND_SHIP: [SUPPLIER], // Kirim Barang ke Gudang + unggah foto tiba
  INBOUND_VIEW: [ADMIN, MANAGER],
  INSPECTION_ASSIGN: [MANAGER], // Perintahkan Pemeriksaan / ganti Staff

  // Pemeriksaan
  INSPECTION_VIEW: [ADMIN, MANAGER, STAFF],
  INSPECTION_PERFORM: [STAFF], // Mulai Periksa, isi & kirim laporan, lapor tidak ditemukan
  INSPECTION_APPROVE: [MANAGER], // setujui / minta revisi (menambah stok)

  // Klaim
  CLAIM_VIEW: [ADMIN, MANAGER, SUPPLIER],
  CLAIM_RESPOND: [SUPPLIER], // kirim barang pengganti / lakukan refund
  CLAIM_DECIDE: [MANAGER], // pilih refund/pengganti, verifikasi refund

  // Barang keluar
  OUTBOUND_VIEW: [ADMIN, MANAGER, STAFF],
  OUTBOUND_CREATE: [STAFF], // buat, perbaiki & ajukan ulang, siapkan, kirim
  OUTBOUND_DELETE: [STAFF], // hapus laporan Pending Approval milik sendiri
  OUTBOUND_DECIDE: [MANAGER], // setujui / tolak / batalkan

  // Inventori, laporan, ekspor
  INVENTORY_VIEW: [ADMIN, MANAGER],
  REPORT_VIEW: [ADMIN, MANAGER],
  EXPORT_PRODUCTS: [ADMIN, MANAGER],
  EXPORT_OUTBOUND: [ADMIN, MANAGER, STAFF],
  EXPORT_RESTOCK: [ADMIN, MANAGER],
  EXPORT_CATEGORIES: [ADMIN, MANAGER],
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
