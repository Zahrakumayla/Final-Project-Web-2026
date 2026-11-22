import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { number: "t.transaction_number", date: "t.transaction_date", status: "t.status", qty: "total_quantity", created: "t.created_at" };
export const TRANSACTION_FILTERS = ["status", "from", "to"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  SELECT t.id, t.transaction_number, t.type, t.status, t.transaction_date, t.customer_name, t.notes, t.rejection_reason,
         t.created_by, t.reviewed_by, t.reviewed_at, t.created_at, t.restock_order_id,
         cu.full_name AS created_by_name, ru.full_name AS reviewed_by_name,
         su.company_name AS supplier_company, ro.po_number,
         (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id)::int AS item_count,
         (SELECT COALESCE(SUM(i.quantity), 0) FROM transaction_items i WHERE i.transaction_id = t.id)::int AS total_quantity,
         (SELECT COALESCE(SUM(i.damaged_quantity), 0) FROM transaction_items i WHERE i.transaction_id = t.id)::int AS total_damaged,
         EXISTS (SELECT 1 FROM transaction_items i WHERE i.transaction_id = t.id AND i.expected_quantity IS NOT NULL AND i.expected_quantity <> i.quantity + i.damaged_quantity) AS has_mismatch,
         sh.delivery_status
  FROM transactions t
  JOIN users cu ON cu.id = t.created_by
  LEFT JOIN users ru ON ru.id = t.reviewed_by
  LEFT JOIN users su ON su.id = t.supplier_id
  LEFT JOIN restock_orders ro ON ro.id = t.restock_order_id
  LEFT JOIN shipments sh ON sh.transaction_id = t.id`;

function buildFilter(user, params, type) {
  const where = new WhereBuilder();
  if (type) where.addWith("t.type = ?::transaction_type", type);
  // Staff hanya melihat transaksi miliknya sendiri
  if (user.role === "warehouse_staff") where.addWith("t.created_by = ?", user.id);
  where.search(["t.transaction_number", "t.customer_name", "su.company_name", "ro.po_number", "cu.full_name"], params.q);
  if (["Pending", "Approved", "Rejected", "Shipped"].includes(params.filters.status)) where.addWith("t.status = ?::transaction_status", params.filters.status);
  if (DATE.test(params.filters.from ?? "")) where.addWith("t.transaction_date >= ?::date", params.filters.from);
  if (DATE.test(params.filters.to ?? "")) where.addWith("t.transaction_date <= ?::date", params.filters.to);
  return where;
}

export async function listTransactions(user, searchParams, type = null) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: TRANSACTION_FILTERS });
  const where = buildFilter(user, params, type);
  const total = (await query(`SELECT COUNT(*) AS total FROM transactions t JOIN users cu ON cu.id = t.created_by LEFT JOIN users su ON su.id = t.supplier_id LEFT JOIN restock_orders ro ON ro.id = t.restock_order_id ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, t.transaction_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function listTransactionsForExport(user, searchParams, type = null) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: TRANSACTION_FILTERS });
  const where = buildFilter(user, params, type);
  return (await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}`, where.values)).rows;
}

export async function getTransaction(user, transactionId) {
  const { rows } = await query(`${SELECT} WHERE t.id = $1`, [transactionId]);
  const tx = rows[0];
  if (!tx) return null;
  if (user.role === "warehouse_staff" && tx.created_by !== user.id) return null;

  const [items, shipment] = await Promise.all([
    query(
      `SELECT i.id, i.product_id, i.rack_id, i.quantity, i.damaged_quantity, i.expected_quantity, i.item_note,
              p.sku, p.name, p.unit, p.image_url, r.rack_code
       FROM transaction_items i JOIN products p ON p.id = i.product_id JOIN racks r ON r.id = i.rack_id
       WHERE i.transaction_id = $1 ORDER BY p.name, r.rack_code`,
      [transactionId],
    ),
    query("SELECT id FROM shipments WHERE transaction_id = $1", [transactionId]),
  ]);
  return { ...tx, items: items.rows, shipmentId: shipment.rows[0]?.id ?? null };
}

// Data pendukung form: rak per produk beserta stok saat ini
export async function listProductRacks() {
  const { rows } = await query(
    `SELECT p.id AS product_id, p.sku, p.name, p.unit, r.id AS rack_id, r.rack_code, COALESCE(pl.quantity, 0)::int AS quantity
     FROM products p CROSS JOIN racks r
     LEFT JOIN product_locations pl ON pl.product_id = p.id AND pl.rack_id = r.id
     WHERE p.is_active ORDER BY p.name, r.rack_code`,
  );
  return rows;
}

// PO Received yang belum dipakai + itemnya (autofill barang masuk)
export async function listReceivablePurchaseOrders() {
  const { rows } = await query(
    `SELECT ro.id, ro.po_number, ro.supplier_id, u.company_name,
            COALESCE(JSON_AGG(JSON_BUILD_OBJECT('productId', i.product_id, 'quantity', i.quantity) ORDER BY i.product_id), '[]') AS items
     FROM restock_orders ro
     JOIN users u ON u.id = ro.supplier_id
     JOIN restock_order_items i ON i.restock_order_id = ro.id
     WHERE ro.status = 'Received'
       AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.restock_order_id = ro.id AND t.status <> 'Rejected')
     GROUP BY ro.id, u.company_name ORDER BY ro.created_at DESC`,
  );
  return rows;
}

async function insertItems(client, transactionId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO transaction_items (transaction_id, product_id, rack_id, quantity, damaged_quantity, expected_quantity, item_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [transactionId, item.productId, item.rackId, item.quantity, item.damagedQuantity, item.expectedQuantity, item.itemNote || null],
    );
  }
}

// Mengisi expected_quantity dari PO bila staff tidak mengisinya.
async function fillExpectedFromPo(client, restockOrderId, items) {
  if (!restockOrderId) return items;
  const po = (await client.query("SELECT product_id, quantity FROM restock_order_items WHERE restock_order_id = $1", [restockOrderId])).rows;
  const expectedByProduct = new Map(po.map((row) => [row.product_id, row.quantity]));
  // expected per produk hanya dipasang pada baris pertama produk tersebut agar tidak terhitung ganda
  const used = new Set();
  return items.map((item) => {
    if (item.expectedQuantity !== null || used.has(item.productId) || !expectedByProduct.has(item.productId)) return item;
    used.add(item.productId);
    return { ...item, expectedQuantity: expectedByProduct.get(item.productId) };
  });
}

export async function createTransaction(staff, type, values) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO transactions (type, transaction_date, restock_order_id, supplier_id, customer_name, notes, created_by)
       VALUES ($1::transaction_type,$2,$3,$4,$5,$6,$7) RETURNING id, transaction_number`,
      [type, values.date, type === "INCOMING" ? values.restockOrderId || null : null, type === "INCOMING" ? values.supplierId : null, type === "OUTGOING" ? values.customerName : null, values.notes || null, staff.id],
    );
    const tx = rows[0];
    await insertItems(client, tx.id, type === "INCOMING" ? await fillExpectedFromPo(client, values.restockOrderId, values.items) : values.items);
    await logActivity(staff.id, type === "INCOMING" ? "Catat barang masuk" : "Catat barang keluar", { description: tx.transaction_number, entityType: "transaction", entityId: tx.id }, client);
    await notifyRole("warehouse_manager", {
      title: "Transaksi menunggu persetujuan",
      message: `${tx.transaction_number} (${type === "INCOMING" ? "barang masuk" : "barang keluar"}) dibuat oleh ${staff.fullName}.`,
      type: "transaction", entityType: "transaction", entityId: tx.id, linkPath: `/manager/transactions/${tx.id}`,
    }, client);
    return { id: tx.id, number: tx.transaction_number };
  });
}

// Edit hanya saat Pending dan hanya oleh pembuatnya. Item diganti seluruhnya.
export async function updateTransaction(staff, transactionId, values) {
  return withTransaction(async (client) => {
    const tx = (await client.query("SELECT id, type, status, created_by, transaction_number, restock_order_id FROM transactions WHERE id = $1 FOR UPDATE", [transactionId])).rows[0];
    if (!tx || tx.created_by !== staff.id) return { ok: false, message: "Transaksi tidak ditemukan." };
    if (tx.status !== "Pending") return { ok: false, message: "Hanya transaksi berstatus Pending yang dapat diedit." };

    await client.query(
      `UPDATE transactions SET transaction_date = $2, notes = $3,
              customer_name = CASE WHEN type = 'OUTGOING' THEN $4 ELSE customer_name END
       WHERE id = $1`,
      [transactionId, values.date, values.notes || null, values.customerName || null],
    );
    await client.query("DELETE FROM transaction_items WHERE transaction_id = $1", [transactionId]);
    await insertItems(client, transactionId, tx.type === "INCOMING" ? await fillExpectedFromPo(client, tx.restock_order_id, values.items) : values.items);
    await logActivity(staff.id, "Ubah transaksi", { description: tx.transaction_number, entityType: "transaction", entityId: transactionId }, client);
    return { ok: true, number: tx.transaction_number };
  });
}

export async function deleteTransaction(staff, transactionId) {
  return withTransaction(async (client) => {
    const tx = (await client.query("SELECT type, status, created_by, transaction_number FROM transactions WHERE id = $1 FOR UPDATE", [transactionId])).rows[0];
    if (!tx || tx.created_by !== staff.id) return { ok: false, message: "Transaksi tidak ditemukan." };
    if (tx.status !== "Pending") return { ok: false, message: "Hanya transaksi berstatus Pending yang dapat dihapus." };
    await client.query("DELETE FROM transactions WHERE id = $1", [transactionId]);
    await logActivity(staff.id, "Hapus transaksi", { description: tx.transaction_number, entityType: "transaction" }, client);
    return { ok: true, number: tx.transaction_number };
  });
}

// Persetujuan/penolakan Manager. Perubahan stok dilakukan TRIGGER database saat Pending -> Approved.
export async function reviewTransaction(manager, transactionId, decision, reason) {
  return withTransaction(async (client) => {
    const tx = (await client.query("SELECT id, type, status, created_by, transaction_number FROM transactions WHERE id = $1 FOR UPDATE", [transactionId])).rows[0];
    if (!tx) return { ok: false, message: "Transaksi tidak ditemukan." };
    if (tx.status !== "Pending") return { ok: false, message: `Transaksi sudah ${tx.status} dan tidak dapat diputuskan lagi.` };

    await client.query(
      "UPDATE transactions SET status = $2::transaction_status, rejection_reason = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1",
      [transactionId, decision, decision === "Rejected" ? reason : null, manager.id],
    );
    await logActivity(manager.id, decision === "Approved" ? "Setujui transaksi" : "Tolak transaksi", { description: tx.transaction_number + (reason ? ` - ${reason}` : ""), entityType: "transaction", entityId: transactionId }, client);
    const base = "/staff";
    await notifyUser(tx.created_by, {
      title: decision === "Approved" ? "Transaksi disetujui" : "Transaksi ditolak",
      message: decision === "Approved" ? `${tx.transaction_number} disetujui. Stok sudah diperbarui${tx.type === "OUTGOING" ? " dan pengiriman siap diproses" : ""}.` : `${tx.transaction_number} ditolak: ${reason}`,
      type: "transaction", entityType: "transaction", entityId: transactionId, linkPath: tx.type === "OUTGOING" && decision === "Approved" ? `${base}/deliveries` : `${base}/${tx.type === "INCOMING" ? "incoming" : "outgoing"}/${transactionId}`,
    }, client);
    return { ok: true, number: tx.transaction_number, type: tx.type };
  });
}

export async function countPendingForManager() {
  const { rows } = await query("SELECT COUNT(*)::int AS total FROM transactions WHERE status = 'Pending'");
  return rows[0].total;
}
