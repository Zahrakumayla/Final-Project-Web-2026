// Pemformat tampilan. Semua teks tampilan berbahasa Indonesia.

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID");

export const formatRupiah = (value) => rupiah.format(Number(value ?? 0));
export const formatNumber = (value) => number.format(Number(value ?? 0));

const TIMEZONE = "Asia/Makassar";

// Tanggal "YYYY-MM-DD" (kolom DATE dari database, dibaca sebagai teks).
export function formatDate(value) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE,
  }).format(new Date(value));
}

export function formatRelativeTime(value) {
  const diffSeconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (diffSeconds < 60) return "Baru saja";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} menit lalu`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} jam lalu`;
  if (diffSeconds < 86400 * 7) return `${Math.floor(diffSeconds / 86400)} hari lalu`;
  return formatDate(new Date(value).toISOString());
}

// Hari ini (YYYY-MM-DD) pada zona waktu gudang. Dipakai sebagai nilai awal input tanggal.
export function todayString() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(new Date());
}
