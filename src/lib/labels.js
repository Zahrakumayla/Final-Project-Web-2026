// Label tampilan yang dipakai bersama (aman diimpor komponen client maupun server).

export const CLAIM_TYPE_LABEL = { Shortage: "Barang kurang", Damaged: "Barang rusak", "Wrong Item": "Barang tidak sesuai" };

// Pilihan penyelesaian klaim untuk Supplier sesuai jenis masalah
export const CLAIM_REPLACEMENT_LABEL = {
  Shortage: "Kirim kekurangan",
  Damaged: "Kirim pengganti",
  "Wrong Item": "Kirim produk yang benar",
};

// Pilihan permintaan Manager ke Supplier sesuai jenis masalah
export const CLAIM_REQUEST_LABEL = {
  Shortage: "Minta kirim kekurangan",
  Damaged: "Minta barang pengganti",
  "Wrong Item": "Minta produk yang benar",
};

export const MOVEMENT_LABEL = { OPENING: "Stok awal", INCOMING: "Barang masuk", OUTGOING: "Barang keluar" };

export const ROLE_OPTIONS = [
  { value: "warehouse_manager", label: "Manajer Gudang" },
  { value: "warehouse_staff", label: "Staf Gudang" },
];

// Terjemahan status untuk TAMPILAN saja. Nilai di database tetap bahasa Inggris, jadi alur tidak berubah.
export const STATUS_LABEL = {
  // Stok
  "Out of Stock": "Habis", Severe: "Kritis", Low: "Menipis", Normal: "Aman",
  // PO dan pengiriman
  Pending: "Menunggu konfirmasi", Confirmed: "Dikonfirmasi", Rejected: "Ditolak", "In Transit": "Dalam pengiriman",
  Arrived: "Sudah tiba", "Partially Received": "Diterima sebagian", Received: "Diterima",
  // Pemeriksaan dan persetujuan
  "Awaiting Inspection": "Menunggu pemeriksaan", "Under Inspection": "Sedang diperiksa", "Not Found": "Barang tidak ditemukan",
  "Inspection Completed": "Pemeriksaan selesai", "Awaiting Approval": "Menunggu persetujuan", Approved: "Disetujui",
  "Revision Requested": "Perlu revisi",
  // Klaim
  "Claim Submitted": "Klaim diajukan", "Replacement In Transit": "Pengganti dalam pengiriman",
  "Refund Processing": "Refund diproses", Resolved: "Selesai", "Claim Rejected": "Klaim ditolak",
  // Barang keluar
  "Pending Approval": "Menunggu persetujuan", Preparing: "Sedang disiapkan", Shipped: "Sudah dikirim", Cancelled: "Dibatalkan",
  // Jenis
  Replacement: "Barang pengganti", Refund: "Refund", PO: "Pesanan (PO)",
};

export const SUPPLIER_STATUS_LABEL = { Pending: "Menunggu verifikasi", Approved: "Disetujui", Rejected: "Ditolak" };

export const statusLabel = (status) => STATUS_LABEL[status] ?? status;

// Ubah daftar status mentah menjadi pilihan filter berbahasa Indonesia
export const statusOptions = (values) => values.map((value) => ({ value, label: statusLabel(value) }));

// Terjemahkan istilah status Inggris yang terselip di dalam kalimat (judul linimasa, notifikasi, log aktivitas).
const STATUS_PATTERN = new RegExp(`\\b(${Object.keys(STATUS_LABEL).sort((a, b) => b.length - a.length).join("|")})\\b`, "g");
export const idText = (text) => (typeof text === "string" ? text.replace(STATUS_PATTERN, (m) => m === "PO" ? m : (STATUS_LABEL[m] ?? m).toLowerCase()) : text);
