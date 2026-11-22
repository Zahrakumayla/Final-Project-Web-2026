import { isUuidText, readInt, readText } from "@/lib/validation/helpers";

// Jenis laporan yang boleh dibuat tiap role + jenis acuannya
export const ISSUE_TYPES_BY_ROLE = {
  supplier: [
    { value: "Lost in Transit", ref: "restock", label: "Barang hilang di perjalanan" },
    { value: "Late Delivery", ref: "restock", label: "Pengiriman terlambat" },
  ],
  warehouse_staff: [
    { value: "Quantity Mismatch", ref: "incoming", label: "Jumlah tidak sesuai" },
    { value: "Damaged Goods", ref: "incoming", label: "Barang rusak" },
    { value: "Outbound Issue", ref: "outgoing", label: "Masalah barang keluar" },
  ],
};

export function parseIssueForm(formData, role) {
  const allowed = ISSUE_TYPES_BY_ROLE[role] ?? [];
  const values = {
    type: readText(formData, "type", 40),
    referenceId: readText(formData, "referenceId", 40),
    description: readText(formData, "description", 2000),
    productId: readText(formData, "productId", 40),
    quantity: readInt(formData, "quantity"),
  };
  const errors = {};
  const typeInfo = allowed.find((t) => t.value === values.type);
  if (!typeInfo) errors.type = "Pilih jenis masalah.";
  if (!isUuidText(values.referenceId)) errors.referenceId = typeInfo?.ref === "restock" ? "Pilih nomor PO." : "Pilih transaksi.";
  if (values.description.length < 10) errors.description = "Jelaskan masalah minimal 10 karakter.";
  if (values.productId) {
    if (!isUuidText(values.productId)) errors.productId = "Produk tidak valid.";
    if (Number.isNaN(values.quantity) || values.quantity < 1) errors.quantity = "Isi jumlah produk bermasalah (minimal 1).";
  }
  return { values, errors, typeInfo, ok: Object.keys(errors).length === 0 };
}

export function parseResolution(formData) {
  const values = { status: readText(formData, "status", 20), note: readText(formData, "note", 1000) };
  const errors = {};
  if (!["Under Review", "Resolved", "Dismissed"].includes(values.status)) errors.status = "Pilih status.";
  if (["Resolved", "Dismissed"].includes(values.status) && !values.note) errors.note = "Catatan penyelesaian wajib diisi.";
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

export const REMEDY_ISSUE_TYPES = ["Lost in Transit", "Quantity Mismatch", "Damaged Goods"];

export function parseRemedyRequest(formData) {
  const values = { remedy: readText(formData, "remedy", 20), refundAmount: readText(formData, "refundAmount", 20), note: readText(formData, "note", 1000) };
  const errors = {};
  if (!["Replacement", "Refund"].includes(values.remedy)) errors.remedy = "Pilih jenis penyelesaian.";
  const amount = /^\d{1,12}$/.test(values.refundAmount) ? Number.parseInt(values.refundAmount, 10) : Number.NaN;
  if (values.remedy === "Refund" && (Number.isNaN(amount) || amount <= 0)) errors.refundAmount = "Isi nominal refund dalam rupiah (angka bulat, lebih dari 0).";
  return { values: { ...values, amount }, errors, ok: Object.keys(errors).length === 0 };
}

export function parseRemedyResponse(formData, remedy) {
  const values = { note: readText(formData, "note", 500), eta: readText(formData, "eta", 10) };
  const errors = {};
  if (!values.note) errors.note = remedy === "Refund" ? "Isi referensi / bukti refund." : "Isi nomor resi atau keterangan pengiriman.";
  if (remedy === "Replacement") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.eta)) errors.eta = "Isi estimasi tiba barang pengganti.";
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

export function parseRemedyComplete(formData) {
  const values = { transactionId: readText(formData, "transactionId", 40) };
  return { values, errors: {}, ok: true };
}
