import { isUuidText, readInt, readRows, readText } from "@/lib/validation/helpers";
import { todayString } from "@/lib/format";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const isValidDate = (text) => DATE_PATTERN.test(text) && !Number.isNaN(new Date(`${text}T00:00:00Z`).getTime());
const MAX_QTY = 1_000_000;

export function parseRestockForm(formData) {
  const values = {
    supplierId: readText(formData, "supplierId", 40),
    expectedDate: readText(formData, "expectedDate", 10),
    notes: readText(formData, "notes", 1000),
    items: readRows(formData, "items", ["productId", "quantity"]).map((row) => ({ productId: row.productId ?? "", quantity: row.quantity ?? "" })),
  };
  const errors = {};
  if (!isUuidText(values.supplierId)) errors.supplierId = "Pilih supplier.";
  if (!isValidDate(values.expectedDate)) errors.expectedDate = "Tanggal estimasi kedatangan wajib diisi.";
  else if (values.expectedDate < todayString()) errors.expectedDate = "Estimasi kedatangan tidak boleh sebelum hari ini.";

  if (values.items.length === 0) errors.items = "Tambahkan minimal satu produk.";
  else {
    const seen = new Set();
    for (const item of values.items) {
      const quantity = /^\d+$/.test(item.quantity) ? Number(item.quantity) : Number.NaN;
      if (!isUuidText(item.productId)) errors.items = "Pilih produk pada setiap baris.";
      else if (seen.has(item.productId)) errors.items = "Produk yang sama tidak boleh dipilih dua kali.";
      else if (!(quantity >= 1 && quantity <= MAX_QTY)) errors.items = `Jumlah harus bilangan bulat 1 sampai ${MAX_QTY.toLocaleString("id-ID")}.`;
      seen.add(item.productId);
      item.quantity = quantity;
    }
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

export function parseDeliveryForm(formData, { currentExpected }) {
  const values = {
    expectedDate: readText(formData, "expectedDate", 10),
    shippedDate: readText(formData, "shippedDate", 10),
    courierName: readText(formData, "courierName", 100),
    trackingNumber: readText(formData, "trackingNumber", 100),
    notes: readText(formData, "notes", 1000),
  };
  const errors = {};
  if (values.expectedDate && !isValidDate(values.expectedDate)) errors.expectedDate = "Format tanggal tidak valid.";
  if (values.shippedDate && !isValidDate(values.shippedDate)) errors.shippedDate = "Format tanggal tidak valid.";
  const changedEta = values.expectedDate && values.expectedDate !== currentExpected;
  if (changedEta && !values.notes) errors.notes = "Catatan wajib diisi saat estimasi kedatangan diubah.";
  return { values, errors, changedEta: Boolean(changedEta), ok: Object.keys(errors).length === 0 };
}

export function parseRating(formData) {
  const rating = readInt(formData, "rating");
  const feedback = readText(formData, "feedback", 500);
  const errors = {};
  if (!(rating >= 1 && rating <= 5)) errors.rating = "Pilih rating 1 sampai 5.";
  return { values: { rating, feedback }, errors, ok: Object.keys(errors).length === 0 };
}
