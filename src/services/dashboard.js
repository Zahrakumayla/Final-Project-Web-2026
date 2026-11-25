import { query } from "@/lib/db";

// Hitungan status stok (berdasarkan Stok Tersedia) semua produk aktif
async function stockCounts() {
  const { rows } = await query("SELECT stock_status, COUNT(*)::int AS total FROM v_product_stock WHERE is_active GROUP BY stock_status");
  const map = Object.fromEntries(rows.map((r) => [r.stock_status, r.total]));
  return { Normal: map.Normal ?? 0, Low: map.Low ?? 0, Severe: map.Severe ?? 0, "Out of Stock": map["Out of Stock"] ?? 0 };
}

const LOW_STOCK_SQL = `SELECT product_id, product_name, sku, physical_stock, available_stock, unit, stock_status FROM v_product_stock
  WHERE is_active AND stock_status <> 'Normal'
  ORDER BY CASE stock_status WHEN 'Out of Stock' THEN 0 WHEN 'Severe' THEN 1 ELSE 2 END, available_stock LIMIT 6`;

// Admin: pengguna, verifikasi supplier, data master, aktivitas sistem (tanpa transaksi stok).
export async function getAdminDashboard() {
  const [users, suppliers, master, pending, recent, stock] = await Promise.all([
    query("SELECT role, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM users GROUP BY role").then((r) => Object.fromEntries(r.rows.map((x) => [x.role, x]))),
    query("SELECT supplier_status AS status, COUNT(*)::int AS total FROM users WHERE role='supplier' GROUP BY supplier_status").then((r) => Object.fromEntries(r.rows.map((x) => [x.status, x.total]))),
    query(
      `SELECT (SELECT COUNT(*) FROM products WHERE is_active)::int AS products, (SELECT COUNT(*) FROM products WHERE NOT is_active)::int AS archived,
              (SELECT COUNT(*) FROM categories)::int AS categories,
              (SELECT COUNT(*) FROM activity_logs WHERE (created_at AT TIME ZONE 'Asia/Makassar')::date = today_local())::int AS activity_today`,
    ).then((r) => r.rows[0]),
    query("SELECT id, company_name, full_name, created_at FROM users WHERE role='supplier' AND supplier_status='Pending' ORDER BY created_at LIMIT 5").then((r) => r.rows),
    query(
      `SELECT a.activity, a.description, a.created_at, u.full_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 6`,
    ).then((r) => r.rows),
    stockCounts(),
  ]);
  return { users, suppliers, master, pendingSuppliers: pending, recent, stock };
}

export async function getManagerDashboard() {
  await query("SELECT detect_late_restocks()");
  const [stock, kpi, lowStock, toInspect, toApprove, outbound, latePos, daily, movements] = await Promise.all([
    stockCounts(),
    query(
      `SELECT (SELECT COALESCE(SUM(physical_stock),0)::int FROM v_product_stock WHERE is_active) AS physical,
              (SELECT COALESCE(SUM(allocated_stock),0)::int FROM v_product_stock WHERE is_active) AS allocated,
              (SELECT COALESCE(SUM(stock_value),0) FROM v_product_stock WHERE is_active) AS stock_value,
              (SELECT COUNT(*)::int FROM restock_orders WHERE status = 'Pending' OR (status = 'Confirmed' AND receipt_status IS NULL)) AS active_po,
              (SELECT COUNT(*)::int FROM inbound_shipments WHERE status = 'In Transit') AS in_transit,
              (SELECT COUNT(*)::int FROM inbound_shipments s WHERE s.status = 'Arrived'
                 AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.shipment_id = s.id AND i.status <> 'Not Found')) AS to_inspect,
              (SELECT COUNT(*)::int FROM inspections WHERE approval_status = 'Awaiting Approval') AS to_approve,
              (SELECT COUNT(*)::int FROM claims WHERE status NOT IN ('Resolved', 'Claim Rejected')) AS open_claims,
              (SELECT COUNT(*)::int FROM claims WHERE (status = 'Claim Submitted' AND requested_resolution IS NULL) OR (status = 'Refund Processing' AND NOT refund_proof_invalid)) AS claims_action,
              (SELECT COUNT(*)::int FROM outbound_orders WHERE status = 'Pending Approval') AS outbound_pending,
              (SELECT COUNT(*)::int FROM outbound_orders WHERE status IN ('Approved', 'Preparing')) AS outbound_progress`,
    ).then((r) => r.rows[0]),
    query(LOW_STOCK_SQL).then((r) => r.rows),
    query(
      `SELECT s.id, s.shipment_number, s.kind, s.arrived_at, ro.po_number FROM inbound_shipments s JOIN restock_orders ro ON ro.id = s.restock_order_id
       WHERE s.status = 'Arrived' AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.shipment_id = s.id AND i.status <> 'Not Found')
       ORDER BY s.arrived_at LIMIT 5`,
    ).then((r) => r.rows),
    query(
      `SELECT i.id, i.inspection_number, i.submitted_at, ro.po_number, u.full_name FROM inspections i
       JOIN inbound_shipments s ON s.id = i.shipment_id JOIN restock_orders ro ON ro.id = s.restock_order_id JOIN users u ON u.id = i.assigned_to
       WHERE i.approval_status = 'Awaiting Approval' ORDER BY i.submitted_at LIMIT 5`,
    ).then((r) => r.rows),
    query(
      `SELECT o.id, o.order_number, o.customer_name, o.status, o.created_at FROM outbound_orders o
       WHERE o.status IN ('Pending Approval', 'Approved', 'Preparing') ORDER BY CASE o.status WHEN 'Pending Approval' THEN 0 ELSE 1 END, o.created_at LIMIT 5`,
    ).then((r) => r.rows),
    query("SELECT id, po_number, supplier_company, expected_delivery_date FROM v_restock_overview WHERE is_late ORDER BY expected_delivery_date LIMIT 5").then((r) => r.rows),
    query(
      `SELECT d::date AS day,
              COALESCE(SUM(sm.quantity_change) FILTER (WHERE sm.movement_type = 'INCOMING'), 0)::int AS incoming,
              COALESCE(-SUM(sm.quantity_change) FILTER (WHERE sm.movement_type = 'OUTGOING'), 0)::int AS outgoing
       FROM generate_series(today_local() - 6, today_local(), '1 day') d
       LEFT JOIN stock_movements sm ON sm.created_at >= d AND sm.created_at < d + INTERVAL '1 day'
       GROUP BY d ORDER BY d`,
    ).then((r) => r.rows),
    query(
      `SELECT sm.movement_type, sm.quantity_change, sm.created_at, p.name
       FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE sm.movement_type <> 'OPENING' ORDER BY sm.created_at DESC LIMIT 6`,
    ).then((r) => r.rows),
  ]);
  return { stock, kpi, lowStock, toInspect, toApprove, outbound, latePos, daily, movements };
}

export async function getStaffDashboard(user) {
  const [counts, tasks, outbound, lowStock] = await Promise.all([
    query(
      `SELECT (SELECT COUNT(*)::int FROM inspections WHERE assigned_to = $1 AND status = 'Awaiting Inspection') AS awaiting,
              (SELECT COUNT(*)::int FROM inspections WHERE assigned_to = $1 AND status = 'Under Inspection') AS under,
              (SELECT COUNT(*)::int FROM inspections WHERE assigned_to = $1 AND approval_status = 'Revision Requested') AS revision,
              (SELECT COUNT(*)::int FROM outbound_orders WHERE status IN ('Approved', 'Preparing')) AS to_prepare,
              (SELECT COUNT(*)::int FROM outbound_orders WHERE status = 'Rejected') AS rejected,
              (SELECT COUNT(*)::int FROM outbound_orders WHERE status = 'Pending Approval') AS pending`,
      [user.id],
    ).then((r) => r.rows[0]),
    query(
      `SELECT i.id, i.inspection_number, i.status, i.approval_status, ro.po_number, s.kind FROM inspections i
       JOIN inbound_shipments s ON s.id = i.shipment_id JOIN restock_orders ro ON ro.id = s.restock_order_id
       WHERE i.assigned_to = $1 AND i.status IN ('Awaiting Inspection', 'Under Inspection') ORDER BY i.created_at LIMIT 6`,
      [user.id],
    ).then((r) => r.rows),
    query(
      `SELECT id, order_number, customer_name, status FROM outbound_orders WHERE status IN ('Approved', 'Preparing', 'Rejected')
       ORDER BY CASE status WHEN 'Preparing' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, updated_at LIMIT 6`,
    ).then((r) => r.rows),
    query(LOW_STOCK_SQL).then((r) => r.rows),
  ]);
  return { counts, tasks, outbound, lowStock };
}

export async function getSupplierDashboard(user) {
  const [counts, recent, claims] = await Promise.all([
    query(
      `SELECT COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'Confirmed' AND shipment_id IS NULL)::int AS to_ship,
              COUNT(*) FILTER (WHERE shipment_status = 'In Transit')::int AS in_transit,
              COUNT(*) FILTER (WHERE receipt_status IS NOT NULL)::int AS received,
              COUNT(*) FILTER (WHERE status = 'Rejected')::int AS rejected
       FROM v_restock_overview WHERE supplier_id = $1`,
      [user.id],
    ).then((r) => r.rows[0]),
    query("SELECT * FROM v_restock_overview WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 6", [user.id]).then((r) => r.rows),
    query(
      `SELECT c.id, c.claim_number, c.claim_type, c.status, c.refund_proof_invalid, c.requested_resolution, p.name AS product_name FROM claims c JOIN products p ON p.id = c.product_id
       WHERE c.supplier_id = $1 AND ((c.status = 'Claim Submitted' AND c.requested_resolution IS NOT NULL) OR (c.status = 'Refund Processing' AND c.refund_proof_invalid)) ORDER BY c.created_at LIMIT 6`,
      [user.id],
    ).then((r) => r.rows),
  ]);
  return { counts, recent, claims };
}
