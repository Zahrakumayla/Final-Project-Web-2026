// Pembaca input form yang dipakai semua validasi modul.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readText(formData, name, max = 500) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Mengembalikan integer, atau NaN bila kosong/bukan angka bulat.
export function readInt(formData, name) {
  const raw = readText(formData, name, 20);
  return /^-?\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
}

export function readMoney(formData, name) {
  const raw = readText(formData, name, 20).replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Number.parseFloat(raw) : Number.NaN;
}

export const isUuidText = (value) => UUID_PATTERN.test(value ?? "");

// Daftar baris item dinamis: field bernama `${prefix}[0][productId]`, dst.
export function readRows(formData, prefix, fields) {
  const rows = new Map();
  for (const [key, value] of formData.entries()) {
    const match = key.match(new RegExp(`^${prefix}\\[(\\d+)\\]\\[(\\w+)\\]$`));
    if (!match || !fields.includes(match[2]) || typeof value !== "string") continue;
    const index = Number(match[1]);
    if (!rows.has(index)) rows.set(index, {});
    rows.get(index)[match[2]] = value.trim();
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}
