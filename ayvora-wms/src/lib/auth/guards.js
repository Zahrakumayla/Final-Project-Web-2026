import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/constants";
import { can, getHomePath } from "@/lib/permissions";
import { findUserByToken, readSessionToken } from "@/lib/auth/session";

// Pengguna yang sedang login, atau null.
export async function getCurrentUser() {
  return findUserByToken(await readSessionToken());
}

// Untuk halaman/aksi yang wajib login. Jika belum login, diarahkan ke /login.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export function hasRole(user, allowedRoles) {
  return Boolean(user) && allowedRoles.includes(user.role);
}

// FONDASI cek role. Contoh pemakaian nanti:
//   const user = await requireRole([ROLES.ADMIN, ROLES.WAREHOUSE_MANAGER]);
// Role yang tidak cocok dikembalikan ke dashboard role-nya sendiri.
export async function requireRole(allowedRoles) {
  const user = await requireUser();
  if (!hasRole(user, allowedRoles)) redirect(getHomePath(user.role));
  return user;
}

// Untuk halaman bersama (dipakai banyak role): wajib login DAN punya izin tertentu.
// Contoh: const user = await requirePermission("PRODUCT_VIEW");
export async function requirePermission(permission) {
  const user = await requireUser();
  if (!can(user, permission)) redirect(getHomePath(user.role));
  return user;
}
