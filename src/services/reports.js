import { query } from "@/lib/db";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Rentang tanggal bawaan: 30 hari terakhir. Input tidak valid diabaikan.
export function resolveRange(raw = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = DATE.test(raw.from ?? "") ? raw.from : new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const to = DATE.test(raw.to ?? "") ? raw.to : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

export async function getReport(range) {
  const p = [range.from, range.to];
  const [inbound, outbound, topOut, suppliers, byCategory, po, claims] = await Promise.all([
    // Hasil pemeriksaan yang disetujui dalam rentang
    query(
      `SELECT COUNT(DISTINCT i.id)::int AS inspections,
              COALESCE(SUM(ii.ordered_qty), 0)::int AS ordered, COALESCE(SUM(ii.good_qty), 0)::int AS good,
              COALESCE(SUM(ii.damaged_qty), 0)::int AS damaged, COALESCE(SUM(ii.shortage_qty), 0)::int AS shortage
       FROM inspections i JOIN inspection_items ii ON ii.inspection_id = i.id
       WHERE i.approval_status = 'Approved' AND i.approved_at >= $1::date AND i.approved_at < ($2::date + 1)`,
      p,
    ).then((r) => r.rows[0]),
    query(
      `SELECT o.status, COUNT(*)::int AS total,
              COALESCE(SUM((SELECT SUM(shipped_qty) FROM outbound_order_items i WHERE i.order_id = o.id)), 0)::int AS shipped_units
       FROM outbound_orders o WHERE o.created_at >= $1::date AND o.created_at < ($2::date + 1) GROUP BY o.status`,
      p,
    ).then((r) => r.rows),
    query(
      `SELECT pr.name, pr.sku, SUM(i.shipped_qty)::int AS total
       FROM outbound_order_items i JOIN outbound_orders o ON o.id = i.order_id JOIN products pr ON pr.id = i.product_id
       WHERE o.status = 'Shipped' AND o.shipped_at >= $1::date AND o.shipped_at < ($2::date + 1) AND i.shipped_qty > 0
       GROUP BY pr.id ORDER BY total DESC LIMIT 5`,
      p,
    ).then((r) => r.rows),
    query(
      `SELECT u.company_name, COUNT(ro.id)::int AS total_po,
              COUNT(ro.id) FILTER (WHERE ro.receipt_status = 'Received')::int AS received,
              COUNT(ro.id) FILTER (WHERE ro.receipt_status = 'Partially Received')::int AS partial,
              COUNT(ro.id) FILTER (WHERE ro.status = 'Rejected')::int AS rejected,
              COUNT(ro.id) FILTER (WHERE ro.is_late)::int AS late,
              (SELECT COUNT(*)::int FROM claims c WHERE c.supplier_id = u.id AND c.created_at >= $1::date AND c.created_at < ($2::date + 1)) AS claims
       FROM users u LEFT JOIN v_restock_overview ro ON ro.supplier_id = u.id AND ro.order_date BETWEEN $1 AND $2
       WHERE u.role = 'supplier' AND u.supplier_status = 'Approved' GROUP BY u.id ORDER BY total_po DESC, u.company_name`,
      p,
    ).then((r) => r.rows),
    query(
      `SELECT category_name AS name, COUNT(*)::int AS products, SUM(physical_stock)::int AS units, SUM(available_stock)::int AS available, SUM(stock_value) AS value
       FROM v_product_stock WHERE is_active GROUP BY category_name ORDER BY category_name`,
    ).then((r) => r.rows),
    query(
      `SELECT CASE WHEN status <> 'Confirmed' THEN status::text WHEN receipt_status IS NOT NULL THEN receipt_status::text
                   WHEN shipment_status IS NOT NULL THEN shipment_status::text ELSE 'Confirmed' END AS stage, COUNT(*)::int AS total
       FROM v_restock_overview WHERE order_date BETWEEN $1 AND $2 GROUP BY 1`,
      p,
    ).then((r) => Object.fromEntries(r.rows.map((x) => [x.stage, x.total]))),
    query(
      `SELECT claim_type AS type, COUNT(*)::int AS total, SUM(quantity)::int AS units,
              COUNT(*) FILTER (WHERE status IN ('Resolved', 'Claim Rejected'))::int AS closed,
              COALESCE(SUM(refund_amount) FILTER (WHERE status = 'Resolved' AND resolution = 'Refund'), 0) AS refunded
       FROM claims WHERE created_at >= $1::date AND created_at < ($2::date + 1) GROUP BY claim_type ORDER BY total DESC`,
      p,
    ).then((r) => r.rows),
  ]);
  return { inbound, outbound, topOut, suppliers, byCategory, po, claims };
}
