import { query } from "@/lib/db";

// Hitungan status stok semua produk aktif
async function stockCounts() {
  const { rows } = await query("SELECT stock_status, COUNT(*)::int AS total FROM v_product_stock WHERE is_active GROUP BY stock_status");
  const map = Object.fromEntries(rows.map((r) => [r.stock_status, r.total]));
  return { Normal: map.Normal ?? 0, Low: map.Low ?? 0, Severe: map.Severe ?? 0, "Out of Stock": map["Out of Stock"] ?? 0 };
}

// Admin: HANYA angka agregat transaksi (tanpa daftar/detail transaksi).
export async function getAdminDashboard() {
  const [stock, totals, suppliers, tx, byCategory, pending] = await Promise.all([
    stockCounts(),
    query("SELECT (SELECT COUNT(*) FROM products WHERE is_active)::int AS products, (SELECT COUNT(*) FROM categories)::int AS categories").then((r) => r.rows[0]),
    query("SELECT supplier_status AS status, COUNT(*)::int AS total FROM users WHERE role='supplier' GROUP BY supplier_status").then((r) => Object.fromEntries(r.rows.map((x) => [x.status, x.total]))),
    query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE type='INCOMING')::int AS incoming, COUNT(*) FILTER (WHERE type='OUTGOING')::int AS outgoing,
              COUNT(*) FILTER (WHERE status='Pending')::int AS pending, COUNT(*) FILTER (WHERE status IN ('Approved','Shipped'))::int AS approved,
              COUNT(*) FILTER (WHERE status='Rejected')::int AS rejected
       FROM transactions`,
    ).then((r) => r.rows[0]),
    query("SELECT c.name, COUNT(p.id)::int AS total FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active GROUP BY c.id ORDER BY c.name").then((r) => r.rows),
    query("SELECT id, company_name, full_name, created_at FROM users WHERE role='supplier' AND supplier_status='Pending' ORDER BY created_at LIMIT 5").then((r) => r.rows),
  ]);
  return { stock, totals, suppliers, tx, byCategory, pendingSuppliers: pending };
}

export async function getManagerDashboard() {
  await query("SELECT detect_late_restocks()");
  const [stock, kpi, lowStock, pending, latePos, daily, byCategory, movements] = await Promise.all([
    stockCounts(),
    query(
      `SELECT (SELECT COALESCE(SUM(quantity),0)::int FROM product_locations) AS total_stock,
              (SELECT COALESCE(SUM(stock_value),0) FROM v_product_stock WHERE is_active) AS stock_value,
              (SELECT COUNT(*)::int FROM transactions WHERE status='Pending') AS pending_tx,
              (SELECT COUNT(*)::int FROM restock_orders WHERE status IN ('Pending','Confirmed','In Transit')) AS active_po,
              (SELECT COUNT(*)::int FROM shipments WHERE delivery_status NOT IN ('Delivered')) AS active_shipments,
              (SELECT COUNT(*)::int FROM issue_reports WHERE status IN ('Open','Under Review')) AS open_issues`,
    ).then((r) => r.rows[0]),
    query("SELECT product_id, product_name, sku, current_stock, unit, stock_status FROM v_product_stock WHERE is_active AND stock_status <> 'Normal' ORDER BY CASE stock_status WHEN 'Out of Stock' THEN 0 WHEN 'Severe' THEN 1 ELSE 2 END, current_stock LIMIT 6").then((r) => r.rows),
    query(
      `SELECT t.id, t.transaction_number, t.type, t.transaction_date, u.full_name AS created_by_name
       FROM transactions t JOIN users u ON u.id = t.created_by WHERE t.status = 'Pending' ORDER BY t.created_at LIMIT 5`,
    ).then((r) => r.rows),
    query("SELECT id, po_number, supplier_company, expected_delivery_date FROM v_restock_overview WHERE is_late ORDER BY expected_delivery_date LIMIT 5").then((r) => r.rows),
    query(
      `SELECT d::date AS day,
              COUNT(t.id) FILTER (WHERE t.type='INCOMING')::int AS incoming, COUNT(t.id) FILTER (WHERE t.type='OUTGOING')::int AS outgoing
       FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day') d
       LEFT JOIN transactions t ON t.transaction_date = d::date AND t.status <> 'Rejected'
       GROUP BY d ORDER BY d`,
    ).then((r) => r.rows),
    query("SELECT category_name AS name, SUM(current_stock)::int AS total FROM v_product_stock WHERE is_active GROUP BY category_name ORDER BY category_name").then((r) => r.rows),
    query(
      `SELECT sm.movement_type, sm.quantity_change, sm.created_at, p.name
       FROM stock_movements sm JOIN products p ON p.id = sm.product_id ORDER BY sm.created_at DESC LIMIT 6`,
    ).then((r) => r.rows),
  ]);
  return { stock, kpi, lowStock, pending, latePos, daily, byCategory, movements };
}

export async function getStaffDashboard(user) {
  const [mine, today, deliveries, receivable, lowStock, recent] = await Promise.all([
    query("SELECT status, COUNT(*)::int AS total FROM transactions WHERE created_by = $1 GROUP BY status", [user.id]).then((r) => Object.fromEntries(r.rows.map((x) => [x.status, x.total]))),
    query(
      `SELECT COUNT(*) FILTER (WHERE type='INCOMING')::int AS incoming, COUNT(*) FILTER (WHERE type='OUTGOING')::int AS outgoing
       FROM transactions WHERE created_by = $1 AND transaction_date = CURRENT_DATE`,
      [user.id],
    ).then((r) => r.rows[0]),
    query(
      `SELECT s.id, s.delivery_status, t.transaction_number, t.customer_name FROM shipments s JOIN transactions t ON t.id = s.transaction_id
       WHERE s.delivery_status <> 'Delivered' ORDER BY s.created_at LIMIT 5`,
    ).then((r) => r.rows),
    query(
      `SELECT ro.id, ro.po_number, u.company_name FROM restock_orders ro JOIN users u ON u.id = ro.supplier_id
       WHERE ro.status = 'Received' AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.restock_order_id = ro.id AND t.status <> 'Rejected')
       ORDER BY ro.updated_at DESC LIMIT 5`,
    ).then((r) => r.rows),
    query("SELECT product_id, product_name, current_stock, unit, stock_status FROM v_product_stock WHERE is_active AND stock_status <> 'Normal' ORDER BY current_stock LIMIT 5").then((r) => r.rows),
    query("SELECT id, transaction_number, type, status, transaction_date FROM transactions WHERE created_by = $1 ORDER BY created_at DESC LIMIT 5", [user.id]).then((r) => r.rows),
  ]);
  return { mine, today, deliveries, receivable, lowStock, recent };
}

export async function getSupplierDashboard(user) {
  const [counts, rating, recent, openIssues] = await Promise.all([
    query("SELECT status, COUNT(*)::int AS total FROM restock_orders WHERE supplier_id = $1 GROUP BY status", [user.id]).then((r) => Object.fromEntries(r.rows.map((x) => [x.status, x.total]))),
    query("SELECT ROUND(AVG(rating),1) AS avg, COUNT(*)::int AS total FROM restock_ratings WHERE supplier_id = $1", [user.id]).then((r) => r.rows[0]),
    query("SELECT id, po_number, status, expected_delivery_date, total_quantity, is_late FROM v_restock_overview WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 6", [user.id]).then((r) => r.rows),
    query("SELECT COUNT(*)::int AS total FROM issue_reports WHERE reported_by = $1 AND status IN ('Open','Under Review')", [user.id]).then((r) => r.rows[0].total),
  ]);
  return { counts, rating, recent, openIssues };
}
