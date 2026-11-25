import { isUuidText, readRows, readText } from "@/lib/validation/helpers";
import { isUploadedFile } from "@/lib/upload";

const COUNT = /^\d{1,7}$/;
const toCount = (text) => (COUNT.test(text ?? "") ? Number(text) : Number.NaN);

// Supplier: Kirim Barang ke Gudang (info kurir opsional)
export function parseShipForm(formData) {
  return {
    values: {
      courierName: readText(formData, "courierName", 100),
      trackingNumber: readText(formData, "trackingNumber", 100),
      notes: readText(formData, "notes", 1000),
    },
    errors: {},
    ok: true,
  };
}

// Manager: Perintahkan Pemeriksaan (menunjuk satu Staff)
export function parseAssignForm(formData) {
  const values = { staffId: readText(formData, "staffId", 40), instruction: readText(formData, "instruction", 500) };
  const errors = {};
  if (!isUuidText(values.staffId)) errors.staffId = "Pilih Staff yang akan memeriksa.";
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

// Laporan pemeriksaan.
// expected: [{ productId, name, orderedQty, current: { photo_url } }] berasal dari DATABASE
// (bukan dari form), sehingga produk dan jumlah dipesan tidak bisa dimanipulasi.
// Error per baris: errors["item-<productId>"] dan errors["mismatch-<index>"],
// data yang sudah diisi dikembalikan utuh ke form.
export function parseInspectionForm(formData, expected, currentMismatchPhotos = []) {
  const rawItems = readRows(formData, "items", ["productId", "receivedQty", "goodQty", "damagedQty", "rackId", "note"]);
  const rawMismatches = readRows(formData, "mismatches", ["expectedProductId", "actualProductId", "actualDescription", "quantity", "note", "keepPhoto"]);
  const notes = readText(formData, "notes", 1000);
  const errors = {};

  const byProduct = new Map(rawItems.map((row, index) => [row.productId, { ...row, index }]));
  const items = expected.map((exp) => {
    const row = byProduct.get(exp.productId) ?? {};
    const photoFile = row.index !== undefined ? formData.get(`items[${row.index}][photo]`) : null;
    const item = {
      productId: exp.productId,
      name: exp.name,
      orderedQty: exp.orderedQty,
      receivedQty: toCount(row.receivedQty),
      goodQty: toCount(row.goodQty),
      damagedQty: toCount(row.damagedQty === "" || row.damagedQty === undefined ? "0" : row.damagedQty),
      rackId: row.rackId ?? "",
      note: (row.note ?? "").slice(0, 500),
      photoFile: isUploadedFile(photoFile) ? photoFile : null,
      keptPhotoUrl: exp.current?.photo_url ?? null,
      raw: { receivedQty: row.receivedQty ?? "", goodQty: row.goodQty ?? "", damagedQty: row.damagedQty ?? "", rackId: row.rackId ?? "", note: row.note ?? "" },
    };
    const key = `item-${exp.productId}`;
    if ([item.receivedQty, item.goodQty, item.damagedQty].some(Number.isNaN)) errors[key] = "Isi jumlah diterima, baik, dan rusak dengan angka bulat 0 atau lebih.";
    else if (item.receivedQty !== item.goodQty + item.damagedQty) errors[key] = `Diterima (${item.receivedQty}) harus sama dengan baik + rusak (${item.goodQty + item.damagedQty}).`;
    else if (item.receivedQty > item.orderedQty) errors[key] = `Diterima tidak boleh melebihi jumlah dipesan (${item.orderedQty}). Catat kelebihan di catatan.`;
    else if (item.goodQty > 0 && !isUuidText(item.rackId)) errors[key] = "Pilih rak tujuan untuk barang baik.";
    else if ((item.damagedQty > 0 || item.receivedQty < item.orderedQty) && !item.note.trim()) errors[key] = "Catatan wajib diisi untuk barang kurang atau rusak.";
    else if (item.damagedQty > 0 && !item.photoFile && !item.keptPhotoUrl) errors[key] = "Foto bukti wajib untuk barang rusak.";
    return item;
  });

  const shortageByProduct = new Map(items.map((item) => [item.productId, Number.isNaN(item.receivedQty) ? 0 : item.orderedQty - item.receivedQty]));
  const mismatches = rawMismatches
    .map((row, index) => ({ ...row, index }))
    .filter((row) => row.expectedProductId || row.actualProductId || row.actualDescription || row.quantity || row.note)
    .map((row) => {
      const photoFile = formData.get(`mismatches[${row.index}][photo]`);
      const kept = row.keepPhoto && currentMismatchPhotos.includes(row.keepPhoto) ? row.keepPhoto : null;
      const mismatch = {
        index: row.index,
        expectedProductId: row.expectedProductId ?? "",
        actualProductId: row.actualProductId ?? "",
        actualDescription: (row.actualDescription ?? "").slice(0, 300),
        quantity: toCount(row.quantity),
        note: (row.note ?? "").slice(0, 500),
        photoFile: isUploadedFile(photoFile) ? photoFile : null,
        keptPhotoUrl: kept,
        raw: { expectedProductId: row.expectedProductId ?? "", actualProductId: row.actualProductId ?? "", actualDescription: row.actualDescription ?? "", quantity: row.quantity ?? "", note: row.note ?? "", keepPhoto: kept ?? "" },
      };
      const key = `mismatch-${row.index}`;
      if (!shortageByProduct.has(mismatch.expectedProductId)) errors[key] = "Pilih produk yang seharusnya diterima (sesuai pesanan).";
      else if (!mismatch.actualProductId && !mismatch.actualDescription.trim()) errors[key] = "Pilih produk aktual dari katalog atau tulis keterangannya.";
      else if (mismatch.actualProductId && !isUuidText(mismatch.actualProductId)) errors[key] = "Produk aktual tidak valid.";
      else if (mismatch.actualProductId === mismatch.expectedProductId) errors[key] = "Produk aktual tidak boleh sama dengan produk pesanan.";
      else if (Number.isNaN(mismatch.quantity) || mismatch.quantity < 1) errors[key] = "Isi jumlah barang tidak sesuai (minimal 1).";
      else if (!mismatch.note.trim()) errors[key] = "Catatan wajib diisi untuk barang tidak sesuai.";
      else if (!mismatch.photoFile && !mismatch.keptPhotoUrl) errors[key] = "Foto bukti wajib untuk barang tidak sesuai.";
      return mismatch;
    });

  // Jumlah produk salah tidak boleh melebihi jumlah kurang produk pesanan tersebut
  const wrongByProduct = new Map();
  for (const m of mismatches) if (!Number.isNaN(m.quantity)) wrongByProduct.set(m.expectedProductId, (wrongByProduct.get(m.expectedProductId) ?? 0) + m.quantity);
  for (const item of items) {
    const wrong = wrongByProduct.get(item.productId) ?? 0;
    if (wrong > 0 && !errors[`item-${item.productId}`] && wrong > item.orderedQty - item.receivedQty) {
      errors[`item-${item.productId}`] = `Barang tidak sesuai (${wrong}) melebihi jumlah kurang (${item.orderedQty - item.receivedQty}). Produk salah tidak dihitung sebagai diterima.`;
    }
  }

  return { values: { items, mismatches, notes }, errors, ok: Object.keys(errors).length === 0 };
}

// Data yang dikembalikan ke form agar isian tidak hilang saat ada error
export function inspectionFormValues({ items, mismatches, notes }) {
  return {
    notes,
    items: Object.fromEntries(items.map((item) => [item.productId, item.raw])),
    mismatches: mismatches.map((m) => m.raw),
  };
}
