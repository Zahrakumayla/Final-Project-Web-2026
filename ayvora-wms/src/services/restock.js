import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { po: "po_number", date: "order_date", eta: "expected_delivery_date", status: "status", items: "total_quantity" };
export const RESTOCK_FILTERS = ["status", "late"];

// scope: "active" = Pending/Confirmed/In Transit ; "history" = Received/Rejected ; "all"
function buildFilter(user, params, scope) {
  const where = new WhereBuilder();
  if (user.role === "supplier") where.addWith("supplier_id = ?", user.id);
  if (scope === "active") where.add("status IN ('Pending','Confirmed','In Transit')");
  if (scope === "history") where.add("status IN ('Received','Rejected')");
  where.search(["po_number", "supplier_company"], params.q);
  if (["Pending", "Confirmed", "Rejected", "In Transit", "Received"].includes(params.filters.status)) where.addWith("status = ?::restock_status", params.filters.status);
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

// Supplier hanya boleh melihat PO miliknya. Manager boleh semua.
export async function getRestock(user, restockId) {
  const { rows } = await query("SELECT * FROM v_restock_overview WHERE id = $1", [restockId]);
  const order = rows[0];
  if (!order) return null;
  if (user.role === "supplier" && order.supplier_id !== user.id) return null;

  const [items, etaUpdates, activity, transactions] = await Promise.all([
    query(
      `SELECT i.id, i.quantity, p.id AS product_id, p.sku, p.name, p.unit, p.image_url
       FROM restock_order_items i JOIN products p ON p.id = i.product_id
       WHERE i.restock_order_id = $1 ORDER BY p.name`,
      [restockId],
    ),
    query(
      `SELECT d.old_expected_date, d.new_expected_date, d.notes, d.created_at, u.full_name
       FROM restock_delivery_updates d LEFT JOIN users u ON u.id = d.updated_by
       WHERE d.restock_order_id = $1 ORDER BY d.created_at DESC`,
      [restockId],
    ),
    query(
      `SELECT a.activity, a.description, a.created_at, u.full_name
       FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = 'restock_order' AND a.entity_id = $1 ORDER BY a.created_at`,
      [restockId],
    ),
    query(
      `SELECT id, transaction_number, status, created_at FROM transactions WHERE restock_order_id = $1 ORDER BY created_at DESC`,
      [restockId],
    ),
  ]);
  const creator = (await query("SELECT full_name FROM users WHERE id = $1", [order.created_by])).rows[0];
  return { ...order, creator_name: creator?.full_name, items: items.rows, etaUpdates: etaUpdates.rows, activity: activity.rows, transactions: transactions.rows };
}

export async function createRestock(manager, values) {
  return withTransaction(async (client) => {
    // Produk harus aktif dan termasuk kategori yang dipasok supplier tersebut.
    const productIds = values.items.map((item) => item.productId);
    const valid = await client.query(
      `SELECT p.id FROM products p
       WHERE p.id = ANY($1::uuid[]) AND p.is_active
         AND EXISTS (SELECT 1 FROM supplier_categories sc WHERE sc.supplier_id = $2 AND sc.category_id = p.category_id)`,
      [productIds, values.supplierId],
    );
    if (valid.rowCount !== productIds.length) {
      return { ok: false, message: "Ada produk yang tidak aktif atau bukan dari kategori yang dipasok supplier ini." };
    }

    const { rows } = await client.query(
      `INSERT INTO restock_orders (supplier_id, created_by, expected_delivery_date, notes, last_updated_by)
       VALUES ($1,$2,$3,$4,$2) RETURNING id, po_number`,
      [values.supplierId, manager.id, values.expectedDate, values.notes || null],
    );
    const order = rows[0];
    for (const item of values.items) {
      await client.query("INSERT INTO restock_order_items (restock_order_id, product_id, quantity) VALUES ($1,$2,$3)", [order.id, item.productId, item.quantity]);
    }
    await logActivity(manager.id, "Buat PO", { description: order.po_number, entityType: "restock_order", entityId: order.id }, client);
    await notifyUser(values.supplierId, { title: "Pesanan restock baru", message: `PO ${order.po_number} menunggu konfirmasi Anda.`, type: "restock", entityType: "restock_order", entityId: order.id, linkPath: `/supplier/restock/${order.id}` }, client);
    return { ok: true, id: order.id, poNumber: order.po_number };
  });
}

async function lockOrder(client, restockId) {
  return (await client.query("SELECT id, po_number, supplier_id, status, expected_delivery_date FROM restock_orders WHERE id = $1 FOR UPDATE", [restockId])).rows[0];
}

// Supplier: konfirmasi atau tolak PO (alasan wajib saat menolak)
export async function respondToRestock(supplier, restockId, decision, reason) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, restockId);
    if (!order || order.supplier_id !== supplier.id) return { ok: false, message: "Pesanan tidak ditemukan." };
    if (order.status !== "Pending") return { ok: false, message: `Pesanan berstatus ${order.status} dan tidak dapat dikonfirmasi/ditolak lagi.` };

    const status = decision === "confirm" ? "Confirmed" : "Rejected";
    await client.query("UPDATE restock_orders SET status = $2::restock_status, status_reason = $3, last_updated_by = $4 WHERE id = $1", [restockId, status, decision === "reject" ? reason : null, supplier.id]);
    await logActivity(supplier.id, status === "Confirmed" ? "Konfirmasi PO" : "Tolak PO", { description: order.po_number + (reason ? ` - ${reason}` : ""), entityType: "restock_order", entityId: restockId }, client);
    await notifyRole("warehouse_manager", {
      title: status === "Confirmed" ? "PO dikonfirmasi supplier" : "PO ditolak supplier",
      message: status === "Confirmed" ? `PO ${order.po_number} dikonfirmasi supplier.` : `PO ${order.po_number} ditolak: ${reason}`,
      type: "restock", entityType: "restock_order", entityId: restockId, linkPath: `/manager/restock/${restockId}`,
    }, client);
    return { ok: true, status, poNumber: order.po_number };
  });
}

// Supplier atau Manager: info pengiriman & perubahan estimasi (tercatat otomatis di riwayat ETA).
export async function updateDelivery(user, restockId, values, changedEta) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, restockId);
    if (!order || (user.role === "supplier" && order.supplier_id !== user.id)) return { ok: false, message: "Pesanan tidak ditemukan." };
    if (!["Confirmed", "In Transit"].includes(order.status)) return { ok: false, message: "Info pengiriman hanya dapat diubah saat PO Confirmed atau In Transit." };

    await client.query(
      `UPDATE restock_orders SET
         expected_delivery_date = COALESCE($2::date, expected_delivery_date),
         shipped_date = COALESCE($3::date, shipped_date),
         courier_name = COALESCE($4, courier_name),
         tracking_number = COALESCE($5, tracking_number),
         delivery_notes = $6,
         last_updated_by = $7
       WHERE id = $1`,
      [restockId, values.expectedDate || null, values.shippedDate || null, values.courierName || null, values.trackingNumber || null, values.notes || null, user.id],
    );
    await logActivity(user.id, "Ubah info pengiriman PO", { description: order.po_number, entityType: "restock_order", entityId: restockId }, client);

    const counterparty = user.role === "supplier" ? { role: "warehouse_manager" } : { id: order.supplier_id };
    const payload = {
      title: changedEta ? "Estimasi kedatangan berubah" : "Info pengiriman diperbarui",
      message: changedEta ? `Estimasi PO ${order.po_number} menjadi ${values.expectedDate}.` : `Info pengiriman PO ${order.po_number} diperbarui.`,
      type: "restock", entityType: "restock_order", entityId: restockId,
    };
    if (counterparty.role) await notifyRole(counterparty.role, { ...payload, linkPath: `/manager/restock/${restockId}` }, client);
    else await notifyUser(counterparty.id, { ...payload, linkPath: `/supplier/restock/${restockId}` }, client);
    return { ok: true };
  });
}

// Manager: Confirmed -> In Transit -> Received
export async function advanceRestock(manager, restockId, target) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, restockId);
    if (!order) return { ok: false, message: "Pesanan tidak ditemukan." };
    const next = { Confirmed: "In Transit", "In Transit": "Received" }[order.status];
    if (!next || next !== target) return { ok: false, message: `PO berstatus ${order.status} tidak dapat diubah menjadi ${target}.` };

    await client.query("UPDATE restock_orders SET status = $2::restock_status, last_updated_by = $3 WHERE id = $1", [restockId, next, manager.id]);
    await logActivity(manager.id, `PO menjadi ${next}`, { description: order.po_number, entityType: "restock_order", entityId: restockId }, client);
    await notifyUser(order.supplier_id, { title: `PO ${next}`, message: `Status PO ${order.po_number} kini ${next}.`, type: "restock", entityType: "restock_order", entityId: restockId, linkPath: `/supplier/restock/${restockId}` }, client);
    if (next === "Received") {
      await notifyRole("warehouse_staff", { title: "Barang PO diterima", message: `PO ${order.po_number} sudah diterima. Silakan catat barang masuk.`, type: "restock", entityType: "restock_order", entityId: restockId, linkPath: `/staff/incoming/new?po=${restockId}` }, client);
    }
    return { ok: true, status: next, poNumber: order.po_number };
  });
}

export async function rateRestock(manager, restockId, { rating, feedback }) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, restockId);
    if (!order) return { ok: false, message: "Pesanan tidak ditemukan." };
    if (order.status !== "Received") return { ok: false, message: "Rating hanya dapat diberikan untuk PO yang sudah Received." };
    const exists = await client.query("SELECT 1 FROM restock_ratings WHERE restock_order_id = $1", [restockId]);
    if (exists.rowCount) return { ok: false, message: "PO ini sudah diberi rating." };
    await client.query("INSERT INTO restock_ratings (restock_order_id, supplier_id, rated_by, rating, feedback) VALUES ($1,$2,$3,$4,$5)", [restockId, order.supplier_id, manager.id, rating, feedback || null]);
    await logActivity(manager.id, "Beri rating supplier", { description: `${order.po_number}: ${rating}/5`, entityType: "restock_order", entityId: restockId }, client);
    await notifyUser(order.supplier_id, { title: "Anda mendapat rating", message: `PO ${order.po_number} dinilai ${rating} dari 5.`, type: "restock", entityType: "restock_order", entityId: restockId, linkPath: `/supplier/restock/${restockId}` }, client);
    return { ok: true };
  });
}
