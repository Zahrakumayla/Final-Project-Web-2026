import { query, withTransaction } from "@/lib/db";
import { AUTH_MESSAGES, ROLES, SUPPLIER_STATUS } from "@/lib/auth/config";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";

// Logika inti autentikasi. Dipakai bersama oleh Server Action (form)
// dan Route Handler (API), jadi aturannya hanya ada di satu tempat.

// Kode error PostgreSQL untuk pelanggaran UNIQUE (email sudah ada).
const PG_UNIQUE_VIOLATION = "23505";

// Hasil: { ok: true, user } atau { ok: false, code, message }.
// Urutan sengaja: password diperiksa DULU, baru status supplier. Dengan begitu
// status akun tidak bocor ke orang yang tidak tahu password-nya.
export async function login(email, password) {
  const { rows } = await query(
    "SELECT id, password_hash, role, supplier_status FROM users WHERE email = $1",
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

  // Password benar BELUM cukup: supplier harus sudah disetujui admin.
  if (user.role === ROLES.SUPPLIER) {
    if (user.supplier_status === SUPPLIER_STATUS.PENDING) {
      return { ok: false, code: "SUPPLIER_PENDING", message: AUTH_MESSAGES.SUPPLIER_PENDING };
    }
    if (user.supplier_status !== SUPPLIER_STATUS.APPROVED) {
      return { ok: false, code: "SUPPLIER_REJECTED", message: AUTH_MESSAGES.SUPPLIER_REJECTED };
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
            business_field, phone, address, supplier_status)
         VALUES ($1, $2, $3, 'supplier', $4, $5, $6, $7, $8, 'Pending')
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
        ],
      );

      await client.query(
        "INSERT INTO supplier_categories (supplier_id, category_id) SELECT $1, UNNEST($2::uuid[])",
        [inserted.rows[0].id, data.categoryIds],
      );
    });
  } catch (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { ok: false, errors: { email: AUTH_MESSAGES.EMAIL_TAKEN } };
    if (error.code === "INVALID_CATEGORY") return { ok: false, errors: { categoryIds: "Kategori tidak valid." } };
    throw error;
  }

  return { ok: true };
}
