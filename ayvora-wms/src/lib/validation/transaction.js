import { isUuidText, readRows, readText } from "@/lib/validation/helpers";
import { isValidDate } from "@/lib/validation/restock";
import { todayString } from "@/lib/format";

const MAX_QTY = 1_000_000;
const toCount = (text) => (/^\d+$/.test(text ?? "") ? Number(text) : Number.NaN);

// type: "INCOMING" | "OUTGOING"
export function parseTransactionForm(formData, type) {
  const values = {
    date: readText(formData, "date", 10),
    notes: readText(formData, "notes", 1000),
    supplierId: readText(formData, "supplierId", 40),
    restockOrderId: readText(formData, "restockOrderId", 40),
    customerName: readText(formData, "customerName", 150),
    items: readRows(formData, "items", ["productId", "rackId", "quantity", "damagedQuantity", "expectedQuantity", "itemNote"]),
  };
  const errors = {};

  if (!isValidDate(values.date)) errors.date = "Tanggal transaksi wajib diisi.";
  else if (values.date > todayString()) errors.date = "Tanggal transaksi tidak boleh di masa depan.";

  if (type === "INCOMING") {
    if (!isUuidText(values.supplierId)) errors.supplierId = "Pilih supplier.";
    if (values.restockOrderId && !isUuidText(values.restockOrderId)) errors.restockOrderId = "PO tidak valid.";
  } else if (!values.customerName) {
    errors.customerName = "Nama pelanggan/tujuan wajib diisi.";
  }

  if (values.items.length === 0) errors.items = "Tambahkan minimal satu produk.";
  const seen = new Set();
  values.items = values.items.map((raw) => {
    const item = {
      productId: raw.productId ?? "",
      rackId: raw.rackId ?? "",
      quantity: toCount(raw.quantity),
      damagedQuantity: type === "INCOMING" ? (raw.damagedQuantity ? toCount(raw.damagedQuantity) : 0) : 0,
      expectedQuantity: type === "INCOMING" && raw.expectedQuantity ? toCount(raw.expectedQuantity) : null,
      itemNote: (raw.itemNote ?? "").slice(0, 300),
    };
    const key = `${item.productId}:${item.rackId}`;
    if (!isUuidText(item.productId) || !isUuidText(item.rackId)) errors.items = "Pilih produk dan rak pada setiap baris.";
    else if (seen.has(key)) errors.items = "Kombinasi produk dan rak yang sama tidak boleh diulang.";
    else if (Number.isNaN(item.quantity) || Number.isNaN(item.damagedQuantity) || (item.expectedQuantity !== null && Number.isNaN(item.expectedQuantity))) errors.items = "Jumlah harus berupa bilangan bulat 0 atau lebih.";
    else if (item.quantity > MAX_QTY || item.damagedQuantity > MAX_QTY) errors.items = "Jumlah terlalu besar.";
    else if (type === "OUTGOING" && item.quantity < 1) errors.items = "Jumlah barang keluar minimal 1.";
    else if (item.quantity + item.damagedQuantity < 1) errors.items = "Jumlah layak atau rusak minimal 1 pada setiap baris.";
    seen.add(key);
    return item;
  });
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

export function parseReviewReason(formData) {
  return readText(formData, "reason", 500);
}
