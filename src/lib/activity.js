import { query } from "@/lib/db";

// Mencatat riwayat aktivitas pengguna ke tabel activity_logs.
const defaultExecutor = { query };

export async function logActivity(userId, activity, { description = null, entityType = null, entityId = null, details = null } = {}, executor = defaultExecutor) {
  await executor.query(
    `INSERT INTO activity_logs (user_id, activity, description, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, activity, description, entityType, entityId, details ? JSON.stringify(details) : null],
  );
}
