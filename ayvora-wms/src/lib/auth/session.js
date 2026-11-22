import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, SUPPLIER_STATUS, ROLES } from "@/lib/auth/config";

// Token acak 256-bit dikirim ke browser lewat cookie HttpOnly.
// Database hanya menyimpan hash-nya (lihat database/migrations/001-create-sessions.sql).
export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function readSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

// Membuat sesi baru di database dan memasang cookie-nya.
export async function startSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  // Bersih-bersih sesi kedaluwarsa agar tabel tidak membengkak.
  await query("DELETE FROM sessions WHERE expires_at <= NOW()");
  await query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)", [
    userId,
    hashToken(token),
    expiresAt,
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true, // tidak bisa dibaca JavaScript di browser
    secure: process.env.NODE_ENV === "production", // HTTPS saja saat production
    sameSite: "lax", // cookie tidak ikut terkirim pada POST lintas situs
    path: "/",
    expires: expiresAt,
  });
}

// Mengembalikan data user jika token valid, belum kedaluwarsa, dan akunnya masih boleh masuk.
// Role SELALU dibaca dari database, tidak pernah dari cookie.
export async function findUserByToken(token) {
  if (!token) return null;

  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.company_name, u.supplier_status, u.avatar_url
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  // Supplier yang statusnya berubah (mis. ditolak admin) langsung kehilangan akses.
  if (row.role === ROLES.SUPPLIER && row.supplier_status !== SUPPLIER_STATUS.APPROVED) return null;

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    companyName: row.company_name,
    supplierStatus: row.supplier_status,
    avatarUrl: row.avatar_url,
  };
}

// Logout: hapus sesi di database (dicabut permanen) dan hapus cookie.
export async function endSession() {
  const token = await readSessionToken();
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
