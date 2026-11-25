import { query } from "@/lib/db";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const STOCK_SORT = { name: "v.product_name", sku: "v.sku", category: "v.category_name", stock: "v.physical_stock", available: "v.available_stock", allocated: "v.allocated_stock", value: "v.stock_value" };

export async function listInventory(searchParams) {
  const params = readListParams(searchParams, { sortable: STOCK_SORT, defaultSort: "name", filters: ["category", "status"] });
  if (params.filters.category && !/^[0-9a-f-]{36}$/i.test(params.filters.category)) params.filters.category = "";
  const where = new WhereBuilder().add("v.is_active");
  where.search(["v.product_name", "v.sku"], params.q);
  if (params.filters.category) where.addWith("v.category_id = ?", params.filters.category);
  if (["Out of Stock", "Severe", "Low", "Normal"].includes(params.filters.status)) where.addWith("v.stock_status = ?", params.filters.status);
  const total = (await query(`SELECT COUNT(*) AS total FROM v_product_stock v ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(
    `SELECT v.*, COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('rack', r.rack_code, 'quantity', pl.quantity) ORDER BY r.rack_code)
                           FROM product_locations pl JOIN racks r ON r.id = pl.rack_id WHERE pl.product_id = v.product_id AND pl.quantity > 0), '[]') AS racks
     FROM v_product_stock v ${where.sql} ORDER BY ${params.orderBy}, v.sku LIMIT ${limit} OFFSET ${offset}`,
    where.values,
  );
  return { rows, params, info: pageInfo(params, total) };
}

export async function inventorySummary() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS products, COALESCE(SUM(physical_stock),0)::int AS units, COALESCE(SUM(allocated_stock),0)::int AS allocated,
            COALESCE(SUM(available_stock),0)::int AS available, COALESCE(SUM(stock_value),0) AS value,
            COUNT(*) FILTER (WHERE stock_status <> 'Normal')::int AS attention
     FROM v_product_stock WHERE is_active`,
  );
  return rows[0];
}

const MOVE_SORT = { date: "sm.created_at", product: "p.name", qty: "sm.quantity_change" };
const MOVE_TYPES = ["OPENING", "INCOMING", "OUTGOING"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function moveFilter(params) {
  const where = new WhereBuilder();
  where.search(["p.name", "p.sku", "ins.inspection_number", "o.order_number", "ro.po_number"], params.q);
  if (MOVE_TYPES.includes(params.filters.type)) where.addWith("sm.movement_type = ?", params.filters.type);
  if (DATE.test(params.filters.from ?? "")) where.addWith("sm.created_at >= ?::date", params.filters.from);
  if (DATE.test(params.filters.to ?? "")) where.addWith("sm.created_at < (?::date + 1)", params.filters.to);
  return where;
}
const MOVE_FROM = `FROM stock_movements sm JOIN products p ON p.id = sm.product_id LEFT JOIN racks r ON r.id = sm.rack_id
  LEFT JOIN inspections ins ON ins.id = sm.inspection_id LEFT JOIN outbound_orders o ON o.id = sm.outbound_order_id
  LEFT JOIN restock_orders ro ON ro.id = sm.restock_order_id LEFT JOIN claims c ON c.id = sm.claim_id LEFT JOIN users u ON u.id = sm.created_by`;
// Sumber pergerakan: pemeriksaan + PO (+ klaim bila barang pengganti) atau barang keluar
const MOVE_SELECT = `SELECT sm.id, sm.movement_type, sm.quantity_before, sm.quantity_change, sm.quantity_after, sm.notes, sm.created_at,
  p.name AS product_name, p.sku, r.rack_code, ins.inspection_number, o.order_number, ro.po_number, c.claim_number,
  COALESCE(o.order_number, ins.inspection_number) AS source_number, u.full_name AS created_by_name
  ${MOVE_FROM}`;

export async function listMovements(searchParams) {
  const params = readListParams(searchParams, { sortable: MOVE_SORT, defaultSort: "date", defaultDir: "desc", filters: ["type", "from", "to"] });
  const where = moveFilter(params);
  const total = (await query(`SELECT COUNT(*) AS total ${MOVE_FROM} ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${MOVE_SELECT} ${where.sql} ORDER BY ${params.orderBy}, sm.id DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function listMovementsForExport(searchParams) {
  const params = readListParams(searchParams, { sortable: MOVE_SORT, defaultSort: "date", defaultDir: "desc", filters: ["type", "from", "to"] });
  const where = moveFilter(params);
  return (await query(`${MOVE_SELECT} ${where.sql} ORDER BY ${params.orderBy}`, where.values)).rows;
}
