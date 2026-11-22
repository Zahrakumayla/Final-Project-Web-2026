import { isUuidText, readInt, readMoney, readText } from "@/lib/validation/helpers";

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,49}$/;

// mode: "create" (ada SKU + stok awal) atau "edit" (SKU & stok tidak bisa diubah)
export function parseProductForm(formData, mode) {
  const values = {
    sku: readText(formData, "sku", 50).toUpperCase(),
    name: readText(formData, "name", 150),
    categoryId: readText(formData, "categoryId", 40),
    description: readText(formData, "description", 1000),
    buyPrice: readMoney(formData, "buyPrice"),
    sellPrice: readMoney(formData, "sellPrice"),
    minStock: readInt(formData, "minStock"),
    lowStock: readInt(formData, "lowStock"),
    unit: readText(formData, "unit", 20),
    initialStock: readInt(formData, "initialStock"),
    rackId: readText(formData, "rackId", 40),
  };
  const errors = {};

  if (mode === "create") {
    if (!values.sku) errors.sku = "SKU wajib diisi.";
    else if (!SKU_PATTERN.test(values.sku)) errors.sku = "SKU 3-50 karakter: huruf, angka, strip (-), atau garis bawah (_).";
  }
  if (!values.name) errors.name = "Nama produk wajib diisi.";
  if (!isUuidText(values.categoryId)) errors.categoryId = "Pilih kategori.";
  if (Number.isNaN(values.buyPrice)) errors.buyPrice = "Harga beli harus berupa angka (0 atau lebih).";
  if (Number.isNaN(values.sellPrice)) errors.sellPrice = "Harga jual harus berupa angka (0 atau lebih).";
  if (!values.unit) errors.unit = "Satuan wajib diisi (mis. pcs, roll).";

  if (Number.isNaN(values.minStock) || values.minStock < 0) errors.minStock = "Stok minimum harus 0 atau lebih.";
  if (Number.isNaN(values.lowStock) || values.lowStock < 1) errors.lowStock = "Batas stok rendah harus 1 atau lebih.";
  else if (!errors.minStock && values.lowStock <= values.minStock) errors.lowStock = "Batas stok rendah harus lebih besar dari stok minimum.";

  if (mode === "create") {
    if (Number.isNaN(values.initialStock)) values.initialStock = 0;
    if (values.initialStock < 0) errors.initialStock = "Stok awal tidak boleh negatif.";
    if (values.initialStock > 0 && !isUuidText(values.rackId)) errors.rackId = "Pilih rak untuk stok awal.";
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

// Nilai yang dikembalikan ke form saat ada error (angka NaN -> teks kosong).
export function toFormValues(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number.isNaN(value) ? "" : String(value ?? "")]));
}
