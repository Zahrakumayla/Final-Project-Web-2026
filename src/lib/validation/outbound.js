import { isUuidText, readRows, readText } from "@/lib/validation/helpers";

const MAX_QTY = 1_000_000;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,20}$/;
const toCount = (text) => (/^\d{1,7}$/.test(text ?? "") ? Number(text) : Number.NaN);

// Laporan barang keluar oleh Staff
export function parseOutboundForm(formData) {
  const values = {
    customerName: readText(formData, "customerName", 150),
    destinationAddress: readText(formData, "destinationAddress", 500),
    contactPhone: readText(formData, "contactPhone", 25),
    notes: readText(formData, "notes", 1000),
    items: readRows(formData, "items", ["productId", "quantity"]).map((row) => ({ productId: row.productId ?? "", quantity: row.quantity ?? "" })),
  };
  const errors = {};
  if (!values.customerName) errors.customerName = "Nama pelanggan / perusahaan wajib diisi.";
  if (!values.destinationAddress) errors.destinationAddress = "Alamat tujuan wajib diisi.";
  else if (values.destinationAddress.length < 8) errors.destinationAddress = "Alamat tujuan terlalu singkat.";
  if (!values.contactPhone) errors.contactPhone = "Nomor kontak wajib diisi.";
  else if (!PHONE_PATTERN.test(values.contactPhone)) errors.contactPhone = "Nomor kontak tidak valid.";

  if (values.items.length === 0) errors.items = "Tambahkan minimal satu produk.";
  const seen = new Set();
  for (const item of values.items) {
    const quantity = toCount(item.quantity);
    if (!isUuidText(item.productId)) errors.items = "Pilih produk pada setiap baris.";
    else if (seen.has(item.productId)) errors.items = "Produk yang sama tidak boleh dipilih dua kali.";
    else if (!(quantity >= 1 && quantity <= MAX_QTY)) errors.items = "Jumlah harus bilangan bulat minimal 1.";
    seen.add(item.productId);
    item.quantity = quantity;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

// Persetujuan Manager: jumlah disetujui per baris (approve[<itemId>])
export function parseApprovalForm(formData, items) {
  const errors = {};
  const approved = items.map((item) => {
    const raw = readText(formData, `approve[${item.id}]`, 10);
    const qty = toCount(raw);
    if (Number.isNaN(qty)) errors[`approve-${item.id}`] = "Isi jumlah disetujui (0 bila produk tidak disetujui).";
    else if (qty > item.requested_qty) errors[`approve-${item.id}`] = `Tidak boleh melebihi permintaan (${item.requested_qty}).`;
    return { itemId: item.id, qty, raw };
  });
  if (!Object.keys(errors).length && approved.every((a) => a.qty === 0)) errors.form = "Minimal satu produk disetujui dengan jumlah lebih dari 0.";
  return { approved, errors, ok: Object.keys(errors).length === 0 };
}

// Barang Telah Dikirim: rak asal & jumlah aktual per baris
export function parseShipOutForm(formData, items) {
  const errors = {};
  const rows = items.filter((item) => item.approved_qty > 0).map((item) => {
    const qty = toCount(readText(formData, `ship[${item.id}][qty]`, 10));
    const rackId = readText(formData, `ship[${item.id}][rackId]`, 40);
    if (Number.isNaN(qty)) errors[`ship-${item.id}`] = "Isi jumlah aktual dikirim.";
    else if (qty > item.approved_qty) errors[`ship-${item.id}`] = `Tidak boleh melebihi jumlah disetujui (${item.approved_qty}).`;
    else if (qty > 0 && !isUuidText(rackId)) errors[`ship-${item.id}`] = "Pilih rak asal.";
    return { itemId: item.id, qty, rackId, approved: item.approved_qty };
  });
  const shipNote = readText(formData, "shipNote", 500);
  if (!Object.keys(errors).length) {
    if (rows.every((r) => r.qty === 0)) errors.form = "Minimal satu produk harus dikirim.";
    else if (rows.some((r) => r.qty < r.approved) && !shipNote) errors.shipNote = "Catatan wajib diisi bila jumlah dikirim kurang dari jumlah disetujui.";
  }
  return { rows, shipNote, errors, ok: Object.keys(errors).length === 0 };
}
