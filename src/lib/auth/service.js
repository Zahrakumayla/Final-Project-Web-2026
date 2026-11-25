import { query, withTransaction } from "@/lib/db";
import { AUTH_MESSAGES, ROLES, SUPPLIER_STATUS } from "@/lib/auth/config";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { hashToken, readSessionToken, startSession } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { notifyRole } from "@/lib/notify";

// Logika inti autentikasi. Dipakai bersama oleh Server Action (form)
// dan Route Handler (API), jadi aturannya hanya ada di satu tempat.

// Kode error PostgreSQL untuk pelanggaran UNIQUE (email sudah ada).
const PG_UNIQUE_VIOLATION = "23505";

// Hasil: { ok: true, user } atau { ok: false, code, message }.
// Urutan sengaja: password diperiksa DULU, baru status supplier. Dengan begitu
// status akun tidak bocor ke orang yang tidak tahu password-nya.
// `allowApplicant`: bila true (dipakai form login di browser), supplier yang masih Pending/Rejected tetap
// diberi sesi KHUSUS untuk melihat halaman status pendaftaran. Sesi itu tidak membuka halaman aplikasi
// apa pun, karena findUserByToken tetap menolak supplier yang belum Approved.
export async function login(email, password, { allowApplicant = false } = {}) {
  const { rows } = await query(
    "SELECT id, password_hash, role, supplier_status, supplier_review_note, is_active FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];

  if (!user) {
    await verifyAgainstDummy(password);
    return { ok: false, code: "INVALID_CREDENTIALS", message: AUTH_MESSAGES.INVALID_CREDENTIALS };
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    return { ok: false, code: "INVALID_CREDENTIALS", message: AUTH_MESSAGES.INVALID_CREDENTIALS };
  }

  // Akun yang dinonaktifkan Admin tidak bisa masuk.
  if (!user.is_active) {
    return { ok: false, code: "ACCOUNT_INACTIVE", message: AUTH_MESSAGES.ACCOUNT_INACTIVE };
  }

  // Password benar BELUM cukup: supplier harus sudah disetujui admin.
  if (user.role === ROLES.SUPPLIER && allowApplicant && user.supplier_status !== SUPPLIER_STATUS.APPROVED) {
    await startSession(user.id);
    return { ok: true, user: { id: user.id, role: user.role, applicant: true } };
  }
  if (user.role === ROLES.SUPPLIER) {
    if (user.supplier_status === SUPPLIER_STATUS.PENDING) {
      return { ok: false, code: "SUPPLIER_PENDING", message: AUTH_MESSAGES.SUPPLIER_PENDING };
    }
    if (user.supplier_status !== SUPPLIER_STATUS.APPROVED) {
      const reason = user.supplier_review_note ? ` Alasan penolakan: ${user.supplier_review_note}` : "";
      return { ok: false, code: "SUPPLIER_REJECTED", message: `Pendaftaran akun Anda ditolak.${reason}` };
    }
  }

  await startSession(user.id);
  return { ok: true, user: { id: user.id, role: user.role } };
}

// `data` berasal dari validateSupplierRegistration (sudah tervalidasi).
// Role dan status TIDAK dibaca dari input: keduanya tertulis langsung di SQL.
// Hasil: { ok: true } atau { ok: false, errors }.
export async function registerSupplier(data) {
  const passwordHash = await hashPassword(data.password);
  let newId = null;

  try {
    await withTransaction(async (client) => {
      const found = await client.query("SELECT id FROM categories WHERE id = ANY($1::uuid[])", [data.categoryIds]);
      if (found.rowCount !== data.categoryIds.length) {
        const error = new Error("Kategori tidak valid");
        error.code = "INVALID_CATEGORY";
        throw error;
      }

      const inserted = await client.query(
        `INSERT INTO users
           (full_name, email, password_hash, role, company_name, company_description,
            business_field, phone, address, website_url, supplier_status)
         VALUES ($1, $2, $3, 'supplier', $4, $5, $6, $7, $8, $9, 'Pending')
         RETURNING id`,
        [
          data.fullName,
          data.email,
          passwordHash,
          data.companyName,
          data.companyDescription,
          data.businessField,
          data.phone,
          data.address,
          data.websiteUrl || null,
        ],
      );

      newId = inserted.rows[0].id;
      await client.query(
        "INSERT INTO supplier_categories (supplier_id, category_id) SELECT $1, UNNEST($2::uuid[])",
        [inserted.rows[0].id, data.categoryIds],
      );

      // Admin diberi tahu ada supplier baru yang menunggu verifikasi.
      await notifyRole(ROLES.ADMIN, {
        title: "Supplier baru mendaftar",
        message: `${data.companyName} menunggu verifikasi.`,
        type: "supplier", entityType: "supplier", entityId: inserted.rows[0].id,
        linkPath: `/admin/suppliers/${inserted.rows[0].id}`,
      }, client);
    });
  } catch (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { ok: false, errors: { email: AUTH_MESSAGES.EMAIL_TAKEN } };
    if (error.code === "INVALID_CATEGORY") return { ok: false, errors: { categoryIds: "Kategori tidak valid." } };
    throw error;
  }

  return { ok: true, id: newId };
}

// Pemohon (supplier Pending/Rejected) yang sedang login, untuk halaman status pendaftaran. Null bila tidak ada.
export async function getApplicant() {
  const token = await readSessionToken();
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.company_name, u.company_description, u.business_field,
            u.address, u.website_url, u.supplier_status, u.supplier_review_note
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.role = 'supplier' AND u.is_active`,
    [hashToken(token)],
  );
  const applicant = rows[0];
  if (!applicant) return null;
  const categories = await query(
    "SELECT c.id, c.name FROM supplier_categories sc JOIN categories c ON c.id = sc.category_id WHERE sc.supplier_id = $1 ORDER BY c.name",
    [applicant.id],
  );
  return { ...applicant, categories: categories.rows };
}

// Supplier yang ditolak memperbaiki datanya dan mengajukan ulang: status kembali Pending, Admin diberi tahu.
export async function resubmitSupplier(userId, data) {
  return withTransaction(async (client) => {
    const current = (await client.query("SELECT id, supplier_status FROM users WHERE id = $1 AND role = 'supplier' FOR UPDATE", [userId])).rows[0];
    if (!current || current.supplier_status !== SUPPLIER_STATUS.REJECTED) {
      return { ok: false, message: "Pendaftaran ini tidak sedang berstatus ditolak." };
    }
    const found = await client.query("SELECT id FROM categories WHERE id = ANY($1::uuid[])", [data.categoryIds]);
    if (found.rowCount !== data.categoryIds.length) return { ok: false, errors: { categoryIds: "Kategori tidak valid." } };

    await client.query(
      `UPDATE users SET full_name = $2, phone = $3, company_name = $4, company_description = $5, business_field = $6,
              address = $7, website_url = $8, supplier_status = 'Pending', supplier_review_note = NULL WHERE id = $1`,
      [userId, data.fullName, data.phone, data.companyName, data.companyDescription, data.businessField, data.address, data.websiteUrl || null],
    );
    await client.query("DELETE FROM supplier_categories WHERE supplier_id = $1", [userId]);
    await client.query("INSERT INTO supplier_categories (supplier_id, category_id) SELECT $1, UNNEST($2::uuid[])", [userId, data.categoryIds]);
    await logActivity(userId, "Ajukan ulang pendaftaran supplier", { description: data.companyName, entityType: "supplier", entityId: userId }, client);
    await notifyRole(ROLES.ADMIN, {
      title: "Supplier mengajukan ulang", message: `${data.companyName} memperbaiki data dan menunggu verifikasi ulang.`,
      type: "supplier", entityType: "supplier", entityId: userId, linkPath: `/admin/suppliers/${userId}`,
    }, client);
    return { ok: true };
  });
}
