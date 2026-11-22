import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";

// Pembantu untuk Server Action.
// Bentuk hasil yang dikembalikan ke form: { status, message?, errors, values }

export const FLASH_COOKIE = "ayvora_flash";

export function errorState(message, errors = {}, values = {}) {
  return { status: "error", message, errors, values };
}

export function successState(message, extra = {}) {
  return { status: "success", message, errors: {}, values: {}, ...extra };
}

// Memastikan pengguna login DAN punya izin. Hak akses diperiksa di server setiap kali.
export async function authorize(permission) {
  const user = await getCurrentUser();
  if (!user) return { error: errorState("Sesi Anda telah berakhir. Silakan masuk kembali.") };
  if (!can(user, permission)) return { error: errorState("Anda tidak memiliki akses untuk tindakan ini.") };
  return { user };
}

// Pesan singkat (toast) yang tampil setelah redirect. Dibaca & dihapus oleh komponen FlashToast.
export async function setFlash(type, message) {
  const cookieStore = await cookies();
  cookieStore.set(FLASH_COOKIE, JSON.stringify({ type, message }), { path: "/", maxAge: 30, sameSite: "lax" });
}

// Kolom UUID dari URL/form harus berbentuk UUID, kalau tidak query akan error.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === "string" && UUID_PATTERN.test(value);

// Mengubah error database (trigger/constraint) menjadi pesan yang aman ditampilkan.
export function databaseMessage(error, fallback = "Terjadi kesalahan pada server. Silakan coba lagi.") {
  // P0001 = RAISE EXCEPTION dari trigger: pesannya memang ditulis untuk pengguna.
  if (error?.code === "P0001") return error.message;
  console.error(error);
  return fallback;
}
