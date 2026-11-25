import { query } from "@/lib/db";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

// Riwayat aktivitas. scope "all" untuk Admin (seluruh sistem),
// scope "warehouse" untuk Manager & Staff (aktivitas operasional gudang saja).
const WAREHOUSE_ENTITIES = ["restock_order", "inbound_shipment", "inspection", "claim", "outbound_order"];
const SORTABLE = { created: "a.created_at", activity: "a.activity", user: "u.full_name" };
export const ACTIVITY_FILTERS = ["entity", "role", "from", "to"];
export const ENTITY_LABEL = {
  restock_order: "Pesanan Pembelian (PO)", inbound_shipment: "Pengiriman", inspection: "Pemeriksaan", claim: "Klaim",
  outbound_order: "Barang keluar", product: "Produk", category: "Kategori", supplier: "Supplier", user: "Pengguna",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROLES = ["admin", "warehouse_manager", "warehouse_staff", "supplier"];

export async function listActivity(searchParams, scope = "all") {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", pageSize: 20, filters: ACTIVITY_FILTERS });
  const where = new WhereBuilder();
  if (scope === "warehouse") where.addWith("a.entity_type = ANY(?::text[])", WAREHOUSE_ENTITIES);
  where.search(["a.activity", "a.description", "u.full_name"], params.q);
  if (Object.hasOwn(ENTITY_LABEL, params.filters.entity)) where.addWith("a.entity_type = ?", params.filters.entity);
  if (ROLES.includes(params.filters.role)) where.addWith("u.role = ?::user_role", params.filters.role);
  if (DATE.test(params.filters.from ?? "")) where.addWith("a.created_at >= ?::date", params.filters.from);
  if (DATE.test(params.filters.to ?? "")) where.addWith("a.created_at < (?::date + 1)", params.filters.to);

  const total = (await query(`SELECT COUNT(*) AS total FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(
    `SELECT a.id, a.activity, a.description, a.entity_type, a.entity_id, a.created_at, u.full_name, u.role
     FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ${where.sql}
     ORDER BY ${params.orderBy}, a.id DESC LIMIT ${limit} OFFSET ${offset}`,
    where.values,
  );
  return { rows, params, info: pageInfo(params, total), entities: scope === "warehouse" ? WAREHOUSE_ENTITIES : Object.keys(ENTITY_LABEL) };
}
