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
  const [byType, topOut, suppliers, byCategory, po, issues] = await Promise.all([
    query(
      `SELECT type, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='Pending')::int AS pending,
              COUNT(*) FILTER (WHERE status IN ('Approved','Shipped'))::int AS approved, COUNT(*) FILTER (WHERE status='Rejected')::int AS rejected,
              COALESCE(SUM((SELECT SUM(quantity) FROM transaction_items i WHERE i.transaction_id = t.id)) FILTER (WHERE status IN ('Approved','Shipped')), 0)::int AS units,
              COALESCE(SUM((SELECT SUM(damaged_quantity) FROM transaction_items i WHERE i.transaction_id = t.id)) FILTER (WHERE status IN ('Approved','Shipped')), 0)::int AS damaged
       FROM transactions t WHERE transaction_date BETWEEN $1 AND $2 GROUP BY type`,
      [range.from, range.to],
    ).then((r) => r.rows),
    query(
      `SELECT p.name, p.sku, SUM(i.quantity)::int AS total
       FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id JOIN products p ON p.id = i.product_id
       WHERE t.type = 'OUTGOING' AND t.status IN ('Approved','Shipped') AND t.transaction_date BETWEEN $1 AND $2
       GROUP BY p.id ORDER BY total DESC LIMIT 5`,
      [range.from, range.to],
    ).then((r) => r.rows),
    query(
      `SELECT u.company_name, COUNT(ro.id)::int AS total_po, COUNT(ro.id) FILTER (WHERE ro.status='Received')::int AS received,
              COUNT(ro.id) FILTER (WHERE ro.status='Rejected')::int AS rejected,
              COUNT(ro.id) FILTER (WHERE ro.is_late)::int AS late,
              (SELECT ROUND(AVG(rating),1) FROM restock_ratings rr WHERE rr.supplier_id = u.id) AS avg_rating
       FROM users u LEFT JOIN v_restock_overview ro ON ro.supplier_id = u.id AND ro.order_date BETWEEN $1 AND $2
       WHERE u.role = 'supplier' AND u.supplier_status = 'Approved' GROUP BY u.id ORDER BY total_po DESC, u.company_name`,
      [range.from, range.to],
    ).then((r) => r.rows),
    query("SELECT category_name AS name, COUNT(*)::int AS products, SUM(current_stock)::int AS units, SUM(stock_value) AS value FROM v_product_stock WHERE is_active GROUP BY category_name ORDER BY category_name").then((r) => r.rows),
    query("SELECT status, COUNT(*)::int AS total FROM restock_orders WHERE order_date BETWEEN $1 AND $2 GROUP BY status", [range.from, range.to]).then((r) => Object.fromEntries(r.rows.map((x) => [x.status, x.total]))),
    query("SELECT issue_type AS type, COUNT(*)::int AS total FROM issue_reports WHERE created_at >= $1::date AND created_at < ($2::date + 1) GROUP BY issue_type ORDER BY total DESC", [range.from, range.to]).then((r) => r.rows),
  ]);
  return { byType, topOut, suppliers, byCategory, po, issues };
}
