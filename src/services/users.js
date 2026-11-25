import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { hashPassword } from "@/lib/auth/password";
import { notifyRole } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

// Manajemen pengguna oleh Admin: buat akun Manager/Staff, nonaktifkan / aktifkan,
// dan reset password. Supplier tetap mendaftar sendiri dan diverifikasi lewat menu Supplier,
// tetapi Admin juga bisa menonaktifkan akun supplier di sini.

const SORTABLE = { name: "u.full_name", email: "u.email", role: "u.role", created: "u.created_at" };
const ROLES = ["admin", "warehouse_manager", "warehouse_staff", "supplier"];
export const USER_FILTERS = ["role", "active"];

export async function listUsers(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: USER_FILTERS });
  const where = new WhereBuilder();
  where.search(["u.full_name", "u.email", "u.company_name"], params.q);
  if (ROLES.includes(params.filters.role)) where.addWith("u.role = ?::user_role", params.filters.role);
  if (params.filters.active === "1") where.add("u.is_active");
  if (params.filters.active === "0") where.add("NOT u.is_active");
  const total = (await query(`SELECT COUNT(*) AS total FROM users u ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.company_name, u.supplier_status, u.created_at,
            (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
     FROM users u ${where.sql} ORDER BY ${params.orderBy}, u.email LIMIT ${limit} OFFSET ${offset}`,
    where.values,
  );
  return { rows, params, info: pageInfo(params, total) };
}

export async function getUser(userId) {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.company_name, u.supplier_status, u.address, u.created_at, u.updated_at,
            (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return null;
  const activity = await query(
    "SELECT activity, description, created_at FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
    [userId],
  );
  return { ...user, activity: activity.rows };
}

export async function createUser(admin, values, password) {
  const passwordHash = await hashPassword(password);
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        "INSERT INTO users (full_name, email, password_hash, role, phone) VALUES ($1,$2,$3,$4::user_role,$5) RETURNING id",
        [values.fullName, values.email, passwordHash, values.role, values.phone || null],
      );
      await logActivity(admin.id, "Buat pengguna", { description: `${values.fullName} (${values.email}) - ${values.role}`, entityType: "user", entityId: rows[0].id }, client);
      return { ok: true, id: rows[0].id };
    });
  } catch (error) {
    if (error.code === "23505") return { ok: false, errors: { email: "Email sudah terdaftar." } };
    throw error;
  }
}

// Menonaktifkan akun mencabut semua sesinya. Supplier yang dinonaktifkan saat masih
// punya PO berjalan: PO tetap tercatat dan Manager diberi tahu untuk menindaklanjuti.
export async function setUserActive(admin, userId, active) {
  return withTransaction(async (client) => {
    const target = (await client.query("SELECT id, full_name, role, is_active, company_name FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!target) return { ok: false, message: "Pengguna tidak ditemukan." };
    if (target.role === "admin") return { ok: false, message: "Akun Admin tidak dapat dinonaktifkan dari sini." };
    if (target.is_active === active) return { ok: false, message: `Akun sudah ${active ? "aktif" : "nonaktif"}.` };

    if (!active && target.role === "warehouse_staff") {
      const open = (await client.query("SELECT COUNT(*)::int AS total FROM inspections WHERE assigned_to = $1 AND status IN ('Awaiting Inspection', 'Under Inspection')", [userId])).rows[0].total;
      if (open > 0) return { ok: false, message: `Staff masih memegang ${open} tugas pemeriksaan aktif. Minta Manager mengalihkan tugas terlebih dahulu.` };
    }

    await client.query("UPDATE users SET is_active = $2 WHERE id = $1", [userId, active]);
    if (!active) await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await logActivity(admin.id, active ? "Aktifkan pengguna" : "Nonaktifkan pengguna", { description: target.company_name ?? target.full_name, entityType: "user", entityId: userId }, client);

    if (!active && target.role === "supplier") {
      const open = (await client.query(
        `SELECT COUNT(*)::int AS total FROM v_restock_overview WHERE supplier_id = $1
         AND (status = 'Pending' OR (status = 'Confirmed' AND receipt_status IS DISTINCT FROM 'Received') OR open_claims > 0)`,
        [userId],
      )).rows[0].total;
      if (open > 0) {
        await notifyRole("warehouse_manager", {
          title: "Supplier dinonaktifkan", message: `${target.company_name} dinonaktifkan Admin dan masih punya ${open} PO/klaim berjalan. Mohon tindak lanjuti.`,
          type: "supplier", entityType: "supplier", entityId: userId, linkPath: `/manager/restock`,
        }, client);
      }
    }
    return { ok: true, name: target.full_name };
  });
}

export async function resetUserPassword(admin, userId, password) {
  const passwordHash = await hashPassword(password);
  return withTransaction(async (client) => {
    const target = (await client.query("SELECT id, full_name, role FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!target) return { ok: false, message: "Pengguna tidak ditemukan." };
    if (!["warehouse_manager", "warehouse_staff"].includes(target.role)) return { ok: false, message: "Reset password hanya untuk akun Manager dan Staff." };
    await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await logActivity(admin.id, "Reset password pengguna", { description: target.full_name, entityType: "user", entityId: userId }, client);
    return { ok: true, name: target.full_name };
  });
}

export async function countUsers() {
  const { rows } = await query(
    `SELECT role, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM users GROUP BY role`,
  );
  return Object.fromEntries(rows.map((r) => [r.role, r]));
}
