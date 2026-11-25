import { query } from "@/lib/db";
import { pageInfo, readListParams } from "@/lib/list-params";

export async function countUnread(userId) {
  const { rows } = await query("SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1 AND NOT is_read", [userId]);
  return rows[0].total;
}

export const NOTIFICATION_FILTERS = ["status"];

export async function listNotifications(userId, searchParams) {
  const params = readListParams(searchParams, { sortable: { date: "created_at" }, defaultSort: "date", defaultDir: "desc", pageSize: 15, filters: NOTIFICATION_FILTERS });
  const conditions = ["user_id = $1"];
  if (params.filters.status === "unread") conditions.push("NOT is_read");
  if (params.filters.status === "read") conditions.push("is_read");
  const where = conditions.join(" AND ");

  const total = (await query(`SELECT COUNT(*) AS total FROM notifications WHERE ${where}`, [userId])).rows[0].total;
  const { rows } = await query(
    `SELECT id, title, message, type, link_path, is_read, created_at FROM notifications
     WHERE ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, params.pageSize, params.offset],
  );
  return { rows, params, info: pageInfo(params, total) };
}

// Hanya notifikasi milik pengguna sendiri yang bisa ditandai (user_id ikut di WHERE).
export async function markRead(userId, notificationId) {
  const { rows } = await query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING link_path", [notificationId, userId]);
  return rows[0] ?? null;
}

export async function markAllRead(userId) {
  const { rowCount } = await query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read", [userId]);
  return rowCount;
}

// Notifikasi otomatis terbaca saat halaman yang dituju dibuka lewat fitur masing-masing role
// (bukan hanya lewat daftar notifikasi). Cocok bila entitasnya sama ATAU tautannya adalah halaman ini.
export async function markEntityRead(userId, { entityType = null, entityId = null, linkPath = null }) {
  const { rowCount } = await query(
    `UPDATE notifications SET is_read = TRUE
     WHERE user_id = $1 AND NOT is_read
       AND (($2::text IS NOT NULL AND entity_type = $2 AND entity_id = $3::uuid) OR ($4::text IS NOT NULL AND link_path = $4))`,
    [userId, entityType, entityId, linkPath],
  );
  return rowCount;
}
