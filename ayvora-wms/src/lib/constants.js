// Konstanta yang dipakai bersama oleh beberapa komponen.
// Menyimpan teks/URL di satu tempat membuat perubahan nanti cukup dilakukan sekali.

export const SITE_NAME = "AYVORA";
export const FOOTER_TEXT = "AYVORA - Ayla Innovation Warehouse - 2026";

// Menu navigasi landing page. `href` harus sama dengan route di folder app.
export const NAV_ITEMS = [
  { label: "Beranda", href: "/" },
  { label: "Tentang Kami", href: "/about" },
];

// Tujuan tombol "Masuk ke AYVORA". Halamannya baru dibuat pada tahap autentikasi.
export const LOGIN_PATH = "/login";

// Informasi kontak pada halaman Tentang Kami.
export const CONTACT_INFO = ["ayvora@gmail.com", "+6289707200702", "ayvora.house"];
