// Menggabungkan nama class secara kondisional: cn("a", cond && "b") -> "a b"
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Membuat URL dengan parameter query baru. Nilai kosong dihapus.
// Contoh: buildHref("/admin/products", { q: "cup", page: "2" }, { page: "3" })
export function buildHref(basePath, params = {}, overrides = {}) {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${basePath}?${text}` : basePath;
}
