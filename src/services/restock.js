import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { po: "po_number", date: "order_date", eta: "expected_delivery_date", status: "status", items: "total_quantity", total: "total_amount" };
export const RESTOCK_FILTERS = ["status", "late"];

// Label gabungan untuk filter daftar: status PO + status pengiriman + penerimaan
export const PO_STAGES = ["Pending", "Confirmed", "In Transit", "Arrived", "Partially Received", "Received", "Rejected"];

// scope: "active" = belum selesai ; "history" = Received / Rejected / Partially Received ; "all"
function buildFilter(user, params, scope) {
  const where = new WhereBuilder();
  if (user.role === "supplier") where.addWith("supplier_id = ?", user.id);
  if (scope === "active") where.add("(status = 'Pending' OR (status = 'Confirmed' AND receipt_status IS NULL) OR open_claims > 0)");
  if (scope === "history") where.add("(status = 'Rejected' OR receipt_status IS NOT NULL)");
  where.search(["po_number", "supplier_company"], params.q);
  const stage = params.filters.status;
  if (["Pending", "Rejected"].includes(stage)) where.addWith("status = ?::restock_status", stage);
  else if (stage === "Confirmed") where.add("status = 'Confirmed' AND shipment_id IS NULL");
  else if (["In Transit", "Arrived"].includes(stage)) where.addWith("shipment_status = ?::inbound_status AND receipt_status IS NULL", stage);
  else if (["Partially Received", "Received"].includes(stage)) where.addWith("receipt_status = ?::receipt_status", stage);
  if (params.filters.late === "1") where.add("is_late");
  return where;
}

export async function listRestock(user, searchParams, scope = "all") {
  await query("SELECT detect_late_restocks()");
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: RESTOCK_FILTERS });
  const where = buildFilter(user, params, scope);
  const total = (await query(`SELECT COUNT(*) AS total FROM v_restock_overview ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`SELECT * FROM v_restock_overview ${where.sql} ORDER BY ${params.orderBy}, po_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function listRestockForExport(user, searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: RESTOCK_FILTERS });
  const where = buildFilter(user, params, "all");
  return (await query(`SELECT * FROM v_restock_overview ${where.sql} ORDER BY ${params.orderBy}`, where.values)).rows;
}

// Tahap PO untuk ditampilkan: gabungan status PO, pengiriman, dan penerimaan
export function poStage(order) {
  if (order.status !== "Confirmed") return order.status;
  if (order.receipt_status) return order.receipt_status;
  if (order.shipment_status) return order.shipment_status;
  return "Confirmed";
}

// Supplier hanya boleh melihat PO miliknya. Manager boleh semua.
export async function getRestock(user, restockId) {
  const { rows } = await query("SELECT * FROM v_restock_overview WHERE id = $1", [restockId]);
  const order = rows[0];
  if (!order) return null;
  if (user.role === "supplier" && order.supplier_id !== user.id) return null;

  const [items, activity, shipments, claims, creator] = await Promise.all([
    query(
      `SELECT i.id, i.quantity, i.unit_price, i.subtotal, p.id AS product_id, p.sku, p.name, p.unit, p.image_url,
              COALESCE((SELECT SUM(ii.good_qty) FROM inspection_items ii
                        JOIN inspections ins ON ins.id = ii.inspection_id AND ins.approval_status = 'Approved'
                        JOIN inbound_shipments s ON s.id = ins.shipment_id
                        WHERE s.restock_order_id = i.restock_order_id AND ii.product_id = i.product_id), 0)::int AS good_received
       FROM restock_order_items i JOIN products p ON p.id = i.product_id
       WHERE i.restock_order_id = $1 ORDER BY p.name`,
      [restockId],
    ),
    query(
      `SELECT a.activity, a.description, a.created_at, u.full_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = 'restock_order' AND a.entity_id = $1 ORDER BY a.created_at`,
      [restockId],
    ),
    query(
      `SELECT s.id, s.shipment_number, s.kind, s.status, s.courier_name, s.tracking_number, s.notes, s.shipped_at, s.arrived_at,
              s.arrival_photo_url, c.claim_number,
              ins.id AS inspection_id, ins.inspection_number, ins.status AS inspection_status, ins.approval_status, st.full_name AS inspector_name
       FROM inbound_shipments s
       LEFT JOIN claims c ON c.id = s.claim_id
       LEFT JOIN LATERAL (SELECT * FROM inspections i WHERE i.shipment_id = s.id ORDER BY i.created_at DESC LIMIT 1) ins ON TRUE
       LEFT JOIN users st ON st.id = ins.assigned_to
       WHERE s.restock_order_id = $1 ORDER BY s.shipped_at`,
      [restockId],
    ),
    query(
      `SELECT c.id, c.claim_number, c.claim_type, c.status, c.quantity, c.resolved_quantity, p.name AS product_name
       FROM claims c JOIN products p ON p.id = c.product_id WHERE c.restock_order_id = $1 ORDER BY c.created_at`,
      [restockId],
    ),
    query("SELECT full_name FROM users WHERE id = $1", [order.created_by]),
  ]);
  return {
    ...order,
    stage: poStage(order),
    creator_name: creator.rows[0]?.full_name,
    items: items.rows,
    activity: activity.rows,
    shipments: shipments.rows,
    claims: claims.rows,
  };
}

export async function createRestock(manager, values) {
  return withTransaction(async (client) => {
    // Produk harus aktif dan termasuk kategori yang dipasok supplier tersebut.
    const productIds = values.items.map((item) => item.productId);
    const valid = await client.query(
      `SELECT p.id, p.buy_price FROM products p
       WHERE p.id = ANY($1::uuid[]) AND p.is_active
         AND EXISTS (SELECT 1 FROM supplier_categories sc WHERE sc.supplier_id = $2 AND sc.category_id = p.category_id)`,
      [productIds, values.supplierId],
    );
    if (valid.rowCount !== productIds.length) {
      return { ok: false, message: "Ada produk yang tidak aktif atau bukan dari kategori yang dipasok supplier ini." };
    }

    const { rows } = await client.query(
      `INSERT INTO restock_orders (supplier_id, created_by, order_date, expected_delivery_date, notes)
       VALUES ($1,$2,today_local(),$3,$4) RETURNING id, po_number`,
      [values.supplierId, manager.id, values.expectedDate, values.notes || null],
    );
    const order = rows[0];
    // Harga satuan ditetapkan sistem (harga beli produk sesuai kontrak), bukan diisi Manager.
    const priceOf = new Map(valid.rows.map((r) => [r.id, r.buy_price]));
    for (const item of values.items) {
      await client.query("INSERT INTO restock_order_items (restock_order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)", [order.id, item.productId, item.quantity, priceOf.get(item.productId)]);
    }
    await logActivity(manager.id, "Buat PO", { description: order.po_number, entityType: "restock_order", entityId: order.id }, client);
    await notifyUser(values.supplierId, { title: "Purchase Order baru", message: `PO ${order.po_number} menunggu konfirmasi Anda.`, type: "restock", entityType: "restock_order", entityId: order.id, linkPath: `/supplier/restock/${order.id}` }, client);
    return { ok: true, id: order.id, poNumber: order.po_number };
  });
}

// Supplier: konfirmasi atau tolak PO (alasan wajib saat menolak). Row lock mencegah klik ganda.
export async function respondToRestock(supplier, restockId, decision, reason) {
  return withTransaction(async (client) => {
    const order = (await client.query("SELECT id, po_number, supplier_id, status FROM restock_orders WHERE id = $1 FOR UPDATE", [restockId])).rows[0];
    if (!order || order.supplier_id !== supplier.id) return { ok: false, message: "Pesanan tidak ditemukan." };
    if (order.status !== "Pending") return { ok: false, message: `PO sudah ${order.status}. Proses ini sudah dilakukan.` };

    const status = decision === "confirm" ? "Confirmed" : "Rejected";
    await client.query("UPDATE restock_orders SET status = $2::restock_status, status_reason = $3 WHERE id = $1", [restockId, status, decision === "reject" ? reason : null]);
    await logActivity(supplier.id, status === "Confirmed" ? "Konfirmasi PO" : "Tolak PO", { description: order.po_number + (reason ? ` - ${reason}` : ""), entityType: "restock_order", entityId: restockId }, client);
    await notifyRole("warehouse_manager", {
      title: status === "Confirmed" ? "PO dikonfirmasi supplier" : "PO ditolak supplier",
      message: status === "Confirmed" ? `PO ${order.po_number} dikonfirmasi dan sedang disiapkan supplier.` : `PO ${order.po_number} ditolak: ${reason}`,
      type: "restock", entityType: "restock_order", entityId: restockId, linkPath: `/manager/restock/${restockId}`,
    }, client);
    return { ok: true, status, poNumber: order.po_number };
  });
}

// Manager: hapus PO yang masih Pending. Notifikasi lama untuk PO ini dibersihkan dan Supplier diberi tahu.
export async function deleteRestock(manager, restockId) {
  return withTransaction(async (client) => {
    const order = (await client.query("SELECT id, po_number, supplier_id, status FROM restock_orders WHERE id = $1 FOR UPDATE", [restockId])).rows[0];
    if (!order) return { ok: false, message: "PO tidak ditemukan atau sudah dihapus." };
    if (order.status !== "Pending") return { ok: false, message: `PO berstatus ${order.status} tidak dapat dihapus. Hanya PO Pending yang bisa dihapus.` };
    await client.query("DELETE FROM notifications WHERE entity_type = 'restock_order' AND entity_id = $1", [restockId]);
    await client.query("DELETE FROM restock_orders WHERE id = $1", [restockId]);
    await logActivity(manager.id, "Hapus PO", { description: `${order.po_number} (Pending)`, entityType: "restock_order" }, client);
    await notifyUser(order.supplier_id, { title: "PO dibatalkan Manager", message: `PO ${order.po_number} dihapus Manager sebelum dikonfirmasi. Tidak perlu ditindaklanjuti.`, type: "restock" }, client);
    return { ok: true, poNumber: order.po_number };
  });
}
