import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/session";

export async function getProfile(userId) {
  const { rows } = await query(
    `SELECT id, full_name, email, role, phone, avatar_url, company_name, business_field, address, website_url, company_description, supplier_status, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

// Email dan role TIDAK bisa diubah dari profil.
export async function updateProfile(user, values, avatarUrl) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET full_name = $2, phone = $3, avatar_url = $4,
              company_name = COALESCE($5, company_name), business_field = COALESCE($6, business_field),
              address = CASE WHEN $5::text IS NULL THEN address ELSE $7 END,
              website_url = CASE WHEN $5::text IS NULL THEN website_url ELSE $8 END,
              company_description = CASE WHEN $5::text IS NULL THEN company_description ELSE $9 END
       WHERE id = $1`,
      [user.id, values.fullName, values.phone || null, avatarUrl, values.companyName ?? null, values.businessField ?? null, values.address || null, values.websiteUrl || null, values.companyDescription || null],
    );
    await logActivity(user.id, "Ubah profil", { entityType: "user", entityId: user.id }, client);
  });
}

// Ganti password: verifikasi password lama; semua sesi lain dicabut, sesi saat ini dipertahankan.
export async function changePassword(user, currentToken, { current, next }) {
  const row = (await query("SELECT password_hash FROM users WHERE id = $1", [user.id])).rows[0];
  if (!row || !(await verifyPassword(current, row.password_hash))) return { ok: false, field: "currentPassword", message: "Kata sandi saat ini salah." };
  const hash = await hashPassword(next);
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, hash]);
    await client.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [user.id, hashToken(currentToken)]);
    await logActivity(user.id, "Ganti kata sandi", { entityType: "user", entityId: user.id }, client);
  });
  return { ok: true };
}
