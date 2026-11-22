export const SESSION_COOKIE_NAME = "ayvora_session";
// Sesi berlaku 7 hari, lalu pengguna harus login ulang.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

// Nilai sama persis dengan enum `user_role` dan `supplier_status` di database.
export const ROLES = {
  ADMIN: "admin",
  WAREHOUSE_MANAGER: "warehouse_manager",
  WAREHOUSE_STAFF: "warehouse_staff",
  SUPPLIER: "supplier",
};

export const SUPPLIER_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const ROLE_LABELS = {
  admin: "Admin",
  warehouse_manager: "Warehouse Manager",
  warehouse_staff: "Warehouse Staff",
  supplier: "Supplier",
};

export const AUTH_MESSAGES = {
  INVALID_CREDENTIALS: "Email atau kata sandi salah.",
  SUPPLIER_PENDING: "Pendaftaran akun Anda masih menunggu persetujuan admin.",
  SUPPLIER_REJECTED: "Pendaftaran akun Anda belum disetujui. Silakan hubungi administrator.",
  SERVER_ERROR: "Terjadi kesalahan pada server. Silakan coba lagi.",
  EMAIL_TAKEN: "Email sudah terdaftar.",
  NOT_LOGGED_IN: "Anda belum login.",
};
