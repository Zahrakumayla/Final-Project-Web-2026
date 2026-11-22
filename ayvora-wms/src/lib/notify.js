import { query } from "@/lib/db";

// Pembuat notifikasi. `executor` boleh `query` biasa atau client transaksi
// (agar notifikasi ikut dibatalkan jika transaksinya gagal).
const defaultExecutor = { query };

export async function notifyUser(userId, { title, message, type = "info", entityType = null, entityId = null, linkPath = null }, executor = defaultExecutor) {
  await executor.query(
    `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, link_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, title, message, type, entityType, entityId, linkPath],
  );
}

// Kirim ke semua pengguna dengan role tertentu (mis. semua Warehouse Manager)
export async function notifyRole(role, { title, message, type = "info", entityType = null, entityId = null, linkPath = null }, executor = defaultExecutor) {
  await executor.query(
    `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id, link_path)
     SELECT id, $2, $3, $4, $5, $6, $7 FROM users WHERE role = $1`,
    [role, title, message, type, entityType, entityId, linkPath],
  );
}
