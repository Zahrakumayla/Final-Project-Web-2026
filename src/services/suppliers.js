import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { company: "u.company_name", date: "u.created_at", status: "u.supplier_status" };

const BASE_SELECT = `
  SELECT u.id, u.full_name, u.email, u.phone, u.company_name, u.business_field, u.supplier_status, u.created_at,
         (SELECT COALESCE(STRING_AGG(c.name, ', ' ORDER BY c.name), '-') FROM supplier_categories sc JOIN categories c ON c.id = sc.category_id WHERE sc.supplier_id = u.id) AS categories
  FROM users u`;

function buildFilter(params) {
  const where = new WhereBuilder().add("u.role = 'supplier'");
  where.search(["u.company_name", "u.full_name", "u.email"], params.q);
  if (["Pending", "Approved", "Rejected"].includes(params.filters.status)) where.addWith("u.supplier_status = ?::supplier_status", params.filters.status);
  return where;
}

export async function listSuppliers(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: ["status"] });
  const where = buildFilter(params);
  const total = (await query(`SELECT COUNT(*) AS total FROM users u ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${BASE_SELECT} ${where.sql} ORDER BY ${params.orderBy} NULLS LAST, u.company_name LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function listSuppliersForExport(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: ["status"] });
  const where = buildFilter(params);
  return (await query(`${BASE_SELECT} ${where.sql} ORDER BY ${params.orderBy} NULLS LAST`, where.values)).rows;
}

export async function getSupplier(supplierId) {
  const { rows } = await query(
    `${BASE_SELECT.replace("u.phone,", "u.phone, u.address, u.company_description, u.website_url, u.supplier_review_note,")} WHERE u.id = $1 AND u.role = 'supplier'`,
    [supplierId],
  );
  const supplier = rows[0];
  if (!supplier) return null;
  const stats = (
    await query(
      `SELECT COUNT(*)::int AS total_po, COUNT(*) FILTER (WHERE receipt_status = 'Received')::int AS received
       FROM restock_orders WHERE supplier_id = $1`,
      [supplierId],
    )
  ).rows[0];
  return { ...supplier, stats };
}

// Supplier aktif (Approved) untuk dipilih saat membuat PO
export async function listApprovedSuppliers() {
  const { rows } = await query(
    `SELECT u.id, u.company_name, u.full_name,
            COALESCE(ARRAY_AGG(sc.category_id) FILTER (WHERE sc.category_id IS NOT NULL), '{}') AS category_ids
     FROM users u LEFT JOIN supplier_categories sc ON sc.supplier_id = u.id
     WHERE u.role = 'supplier' AND u.supplier_status = 'Approved'
     GROUP BY u.id ORDER BY u.company_name`,
  );
  return rows;
}

// Keputusan Admin. Pending -> Approved/Rejected, dan Rejected -> Approved (peninjauan ulang).
export async function reviewSupplier(admin, supplierId, decision, note) {
  return withTransaction(async (client) => {
    const current = (await client.query("SELECT company_name, supplier_status FROM users WHERE id = $1 AND role = 'supplier' FOR UPDATE", [supplierId])).rows[0];
    if (!current) return { ok: false, message: "Supplier tidak ditemukan." };
    const from = current.supplier_status;
    const allowed = (from === "Pending" && ["Approved", "Rejected"].includes(decision)) || (from === "Rejected" && decision === "Approved");
    if (!allowed) return { ok: false, message: `Status supplier ${from} tidak dapat diubah menjadi ${decision}.` };

    await client.query("UPDATE users SET supplier_status = $2::supplier_status, supplier_review_note = $3 WHERE id = $1", [supplierId, decision, decision === "Rejected" ? note : null]);
    if (decision === "Rejected") await client.query("DELETE FROM sessions WHERE user_id = $1", [supplierId]);
    await logActivity(admin.id, decision === "Approved" ? "Setujui supplier" : "Tolak supplier", { description: current.company_name, entityType: "supplier", entityId: supplierId, details: note ? { reason: note } : null }, client);
    return { ok: true, name: current.company_name };
  });
}

export async function countByStatus() {
  const { rows } = await query("SELECT supplier_status AS status, COUNT(*)::int AS total FROM users WHERE role='supplier' GROUP BY supplier_status");
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}
