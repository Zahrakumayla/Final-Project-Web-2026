import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

// Barang keluar ke pelanggan F&B. Pengurangan stok fisik dan alokasi dijaga trigger
// database (guard_outbound_update): alokasi saat Approved, stok berkurang saat Shipped.

const SORTABLE = { number: "o.order_number", created: "o.created_at", status: "o.status", customer: "o.customer_name" };
export const OUTBOUND_FILTERS = ["status", "type", "from", "to"];
// Tipe transaksi barang keluar: pengajuan pertama, diajukan ulang setelah ditolak, atau dikirim sebagian
export const OUTBOUND_TYPES = [["new", "Pengajuan baru"], ["resubmitted", "Diajukan ulang"], ["partial", "Dikirim sebagian"]];
export const OUTBOUND_STATUSES = ["Pending Approval", "Approved", "Rejected", "Preparing", "Shipped", "Cancelled"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  SELECT o.*, cu.full_name AS created_by_name, dc.full_name AS decided_by_name, pr.full_name AS prepared_by_name,
         sh.full_name AS shipped_by_name, ca.full_name AS cancelled_by_name,
         (SELECT COUNT(*) FROM outbound_order_items i WHERE i.order_id = o.id)::int AS item_count,
         (SELECT COALESCE(SUM(requested_qty), 0) FROM outbound_order_items i WHERE i.order_id = o.id)::int AS total_requested,
         (SELECT SUM(approved_qty) FROM outbound_order_items i WHERE i.order_id = o.id)::int AS total_approved,
         (SELECT SUM(shipped_qty) FROM outbound_order_items i WHERE i.order_id = o.id)::int AS total_shipped
  FROM outbound_orders o
  JOIN users cu ON cu.id = o.created_by
  LEFT JOIN users dc ON dc.id = o.decided_by
  LEFT JOIN users pr ON pr.id = o.prepared_by
  LEFT JOIN users sh ON sh.id = o.shipped_by
  LEFT JOIN users ca ON ca.id = o.cancelled_by`;

function buildFilter(params) {
  const where = new WhereBuilder();
  where.search(["o.order_number", "o.customer_name", "o.destination_address", "cu.full_name"], params.q);
  if (OUTBOUND_STATUSES.includes(params.filters.status)) where.addWith("o.status = ?::outbound_status", params.filters.status);
  if (params.filters.status === "active") where.add("o.status IN ('Pending Approval', 'Approved', 'Rejected', 'Preparing')");
  if (params.filters.type === "new") where.add("o.submission_count = 1");
  if (params.filters.type === "resubmitted") where.add("o.submission_count > 1");
  if (params.filters.type === "partial") where.add("o.status = 'Shipped' AND (SELECT SUM(shipped_qty) FROM outbound_order_items i WHERE i.order_id = o.id) < (SELECT SUM(approved_qty) FROM outbound_order_items i WHERE i.order_id = o.id)");
  if (DATE.test(params.filters.from ?? "")) where.addWith("(o.created_at AT TIME ZONE 'Asia/Makassar')::date >= ?::date", params.filters.from);
  if (DATE.test(params.filters.to ?? "")) where.addWith("(o.created_at AT TIME ZONE 'Asia/Makassar')::date <= ?::date", params.filters.to);
  return where;
}

// Staff mana pun boleh melanjutkan tugas, jadi Staff melihat semua laporan barang keluar.
export async function listOutbound(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: OUTBOUND_FILTERS });
  const where = buildFilter(params);
  const total = (await query(`SELECT COUNT(*) AS total FROM outbound_orders o JOIN users cu ON cu.id = o.created_by ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, o.order_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function listOutboundForExport(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: OUTBOUND_FILTERS });
  const where = buildFilter(params);
  return (await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}`, where.values)).rows;
}

export async function getOutbound(orderId) {
  const { rows } = await query(`${SELECT} WHERE o.id = $1`, [orderId]);
  const order = rows[0];
  if (!order) return null;
  const [items, events] = await Promise.all([
    query(
      `SELECT i.*, p.name, p.sku, p.unit, p.image_url, r.rack_code,
              v.physical_stock, v.allocated_stock, v.available_stock,
              COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('rackId', r2.id, 'rackCode', r2.rack_code, 'quantity', pl.quantity) ORDER BY pl.quantity DESC)
                        FROM product_locations pl JOIN racks r2 ON r2.id = pl.rack_id WHERE pl.product_id = i.product_id AND pl.quantity > 0), '[]') AS racks
       FROM outbound_order_items i
       JOIN products p ON p.id = i.product_id
       JOIN v_product_stock v ON v.product_id = i.product_id
       LEFT JOIN racks r ON r.id = i.rack_id
       WHERE i.order_id = $1 ORDER BY p.name`,
      [orderId],
    ),
    query(
      `SELECT e.seq, e.status, e.note, e.created_at, u.full_name FROM outbound_order_events e
       LEFT JOIN users u ON u.id = e.actor_id WHERE e.order_id = $1 ORDER BY e.seq`,
      [orderId],
    ),
  ]);
  return { ...order, items: items.rows, events: events.rows };
}

// Produk aktif + stok tersedia untuk form laporan barang keluar
export async function listProductsForOutbound() {
  const { rows } = await query(
    "SELECT product_id, sku, product_name, unit, physical_stock, allocated_stock, available_stock FROM v_product_stock WHERE is_active ORDER BY product_name",
  );
  return rows;
}

async function assertActiveProducts(client, items) {
  const ids = items.map((item) => item.productId);
  const found = await client.query("SELECT id FROM products WHERE id = ANY($1::uuid[]) AND is_active", [ids]);
  return found.rowCount === ids.length;
}

// Sistem menolak otomatis bila jumlah diminta melebihi stok yang tersedia
async function checkStock(client, items) {
  const ids = items.map((item) => item.productId);
  const { rows } = await client.query("SELECT product_id, product_name, unit, available_stock FROM v_product_stock WHERE product_id = ANY($1::uuid[])", [ids]);
  const stockOf = new Map(rows.map((r) => [r.product_id, r]));
  for (const item of items) {
    const p = stockOf.get(item.productId);
    if (!p) continue;
    if (p.available_stock <= 0) return `Stok ${p.product_name} habis, barang tidak dapat diajukan keluar.`;
    if (item.quantity > p.available_stock) return `Stok ${p.product_name} hanya ${p.available_stock} ${p.unit}, tidak cukup untuk jumlah ${item.quantity}. Kurangi jumlahnya.`;
  }
  return null;
}

async function insertItems(client, orderId, items) {
  for (const item of items) {
    await client.query("INSERT INTO outbound_order_items (order_id, product_id, requested_qty) VALUES ($1,$2,$3)", [orderId, item.productId, item.quantity]);
  }
}

export async function createOutbound(staff, values) {
  return withTransaction(async (client) => {
    if (!(await assertActiveProducts(client, values.items))) return { ok: false, message: "Ada produk yang tidak aktif." };
    const stockError = await checkStock(client, values.items);
    if (stockError) return { ok: false, message: stockError };
    const order = (await client.query(
      `INSERT INTO outbound_orders (customer_name, destination_address, contact_phone, notes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, order_number`,
      [values.customerName, values.destinationAddress, values.contactPhone, values.notes || null, staff.id],
    )).rows[0];
    await insertItems(client, order.id, values.items);
    await logActivity(staff.id, "Buat laporan barang keluar", { description: `${order.order_number} - ${values.customerName}`, entityType: "outbound_order", entityId: order.id }, client);
    await notifyRole("warehouse_manager", {
      title: "Barang keluar menunggu persetujuan", message: `${order.order_number} untuk ${values.customerName} dibuat ${staff.fullName}.`,
      type: "outbound", entityType: "outbound_order", entityId: order.id, linkPath: `/manager/outgoing/${order.id}`,
    }, client);
    return { ok: true, id: order.id, number: order.order_number };
  });
}

// Staff memperbaiki laporan Pending Approval / Rejected. Laporan Rejected langsung diajukan ulang.
export async function updateOutbound(staff, orderId, values) {
  return withTransaction(async (client) => {
    const order = (await client.query("SELECT id, order_number, status FROM outbound_orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (!["Pending Approval", "Rejected"].includes(order.status)) return { ok: false, message: `Laporan berstatus ${order.status} tidak dapat diubah.` };
    if (!(await assertActiveProducts(client, values.items))) return { ok: false, message: "Ada produk yang tidak aktif." };
    // Saat mengubah laporan, stok yang sedang dialokasikan untuk laporan ini belum ada (masih menunggu), jadi cek biasa
    const stockError = await checkStock(client, values.items);
    if (stockError) return { ok: false, message: stockError };

    await client.query(
      "UPDATE outbound_orders SET customer_name = $2, destination_address = $3, contact_phone = $4, notes = $5, updated_by = $6 WHERE id = $1",
      [orderId, values.customerName, values.destinationAddress, values.contactPhone, values.notes || null, staff.id],
    );
    await client.query("DELETE FROM outbound_order_items WHERE order_id = $1", [orderId]);
    await insertItems(client, orderId, values.items);
    const resubmit = order.status === "Rejected";
    if (resubmit) await client.query("UPDATE outbound_orders SET status = 'Pending Approval', updated_by = $2 WHERE id = $1", [orderId, staff.id]);
    await logActivity(staff.id, resubmit ? "Ajukan ulang barang keluar" : "Ubah laporan barang keluar", { description: order.order_number, entityType: "outbound_order", entityId: orderId }, client);
    if (resubmit) {
      await notifyRole("warehouse_manager", {
        title: "Barang keluar diajukan ulang", message: `${order.order_number} diperbaiki dan diajukan ulang oleh ${staff.fullName}.`,
        type: "outbound", entityType: "outbound_order", entityId: orderId, linkPath: `/manager/outgoing/${orderId}`,
      }, client);
    }
    return { ok: true, number: order.order_number, resubmit };
  });
}

async function lockOrder(client, orderId) {
  return (await client.query("SELECT id, order_number, status, created_by, customer_name FROM outbound_orders WHERE id = $1 FOR UPDATE", [orderId])).rows[0];
}

// Pihak Staff yang perlu tahu: pembuat + yang menyiapkan
async function notifyStaff(client, order, payload) {
  await notifyUser(order.created_by, { ...payload, entityType: "outbound_order", entityId: order.id, linkPath: `/staff/outgoing/${order.id}` }, client);
}

// Manager menyetujui SATU KALI sebesar Stok Tersedia (validasi akhir oleh trigger dengan row lock)
export async function approveOutbound(manager, orderId, approved) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (order.status !== "Pending Approval") return { ok: false, message: `Laporan sudah ${order.status}. Persetujuan hanya sekali.` };
    for (const row of approved) {
      await client.query("UPDATE outbound_order_items SET approved_qty = $3 WHERE id = $1 AND order_id = $2", [row.itemId, orderId, row.qty]);
    }
    await client.query("UPDATE outbound_orders SET status = 'Approved', decided_by = $2, updated_by = $2 WHERE id = $1", [orderId, manager.id]);
    const totals = (await client.query("SELECT SUM(requested_qty)::int AS requested, SUM(approved_qty)::int AS approved FROM outbound_order_items WHERE order_id = $1", [orderId])).rows[0];
    const partial = totals.approved < totals.requested;
    await logActivity(manager.id, "Setujui barang keluar", { description: `${order.order_number}: ${totals.approved}/${totals.requested} unit dialokasikan`, entityType: "outbound_order", entityId: orderId }, client);
    await notifyStaff(client, order, {
      title: "Barang keluar disetujui",
      message: `${order.order_number} disetujui${partial ? ` sebagian (${totals.approved} dari ${totals.requested} unit, sesuai stok tersedia)` : ""}. Silakan siapkan barang.`,
      type: "outbound",
    });
    return { ok: true, number: order.order_number, partial };
  });
}

export async function rejectOutbound(manager, orderId, reason) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (order.status !== "Pending Approval") return { ok: false, message: `Laporan sudah ${order.status}.` };
    await client.query("UPDATE outbound_orders SET status = 'Rejected', rejection_reason = $2, decided_by = $3, updated_by = $3 WHERE id = $1", [orderId, reason, manager.id]);
    await logActivity(manager.id, "Tolak barang keluar", { description: `${order.order_number} - ${reason}`, entityType: "outbound_order", entityId: orderId }, client);
    await notifyStaff(client, order, { title: "Barang keluar ditolak", message: `${order.order_number}: ${reason}. Perbaiki lalu ajukan ulang.`, type: "outbound" });
    return { ok: true, number: order.order_number };
  });
}

export async function startPreparing(staff, orderId) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (order.status !== "Approved") return { ok: false, message: order.status === "Preparing" ? "Barang sudah disiapkan. Proses ini sudah dilakukan." : "Barang hanya dapat disiapkan setelah disetujui Manager." };
    await client.query("UPDATE outbound_orders SET status = 'Preparing', prepared_by = $2, updated_by = $2 WHERE id = $1", [orderId, staff.id]);
    await logActivity(staff.id, "Siapkan barang keluar", { description: order.order_number, entityType: "outbound_order", entityId: orderId }, client);
    return { ok: true, number: order.order_number };
  });
}

// Barang Telah Dikirim: stok fisik berkurang sekali sebesar jumlah aktual, alokasi dilepas (trigger)
export async function shipOutbound(staff, orderId, rows, shipNote) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (order.status !== "Preparing") return { ok: false, message: order.status === "Shipped" ? "Barang sudah dikirim. Proses ini sudah dilakukan." : "Barang hanya dapat dikirim dari status Preparing." };
    for (const row of rows) {
      await client.query("UPDATE outbound_order_items SET shipped_qty = $3, rack_id = $4 WHERE id = $1 AND order_id = $2", [row.itemId, orderId, row.qty, row.qty > 0 ? row.rackId : null]);
    }
    await client.query("UPDATE outbound_orders SET status = 'Shipped', shipped_by = $2, ship_note = $3, updated_by = $2 WHERE id = $1", [orderId, staff.id, shipNote || null]);
    const total = rows.reduce((sum, row) => sum + row.qty, 0);
    await logActivity(staff.id, "Barang telah dikirim", { description: `${order.order_number}: ${total} unit ke ${order.customer_name}`, entityType: "outbound_order", entityId: orderId }, client);
    await notifyRole("warehouse_manager", {
      title: "Barang keluar terkirim", message: `${order.order_number} (${order.customer_name}) dikirim ${total} unit oleh ${staff.fullName}.`,
      type: "outbound", entityType: "outbound_order", entityId: orderId, linkPath: `/manager/outgoing/${orderId}`,
    }, client);
    return { ok: true, number: order.order_number };
  });
}

export async function cancelOutbound(manager, orderId, reason) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan." };
    if (!["Approved", "Preparing"].includes(order.status)) return { ok: false, message: `Laporan berstatus ${order.status} tidak dapat dibatalkan.` };
    await client.query("UPDATE outbound_orders SET status = 'Cancelled', cancel_reason = $2, cancelled_by = $3, updated_by = $3 WHERE id = $1", [orderId, reason, manager.id]);
    await logActivity(manager.id, "Batalkan barang keluar", { description: `${order.order_number} - ${reason}`, entityType: "outbound_order", entityId: orderId }, client);
    await notifyStaff(client, order, { title: "Barang keluar dibatalkan", message: `${order.order_number}: ${reason}. Alokasi stok dilepas.`, type: "outbound" });
    return { ok: true, number: order.order_number };
  });
}

export async function listRacks() {
  const { rows } = await query("SELECT id, rack_code FROM racks ORDER BY rack_code");
  return rows;
}

// Staff: hapus laporan barang keluar Pending Approval, hanya yang dibuatnya sendiri.
export async function deleteOutbound(staff, orderId) {
  return withTransaction(async (client) => {
    const order = await lockOrder(client, orderId);
    if (!order) return { ok: false, message: "Laporan tidak ditemukan atau sudah dihapus." };
    if (order.created_by !== staff.id) return { ok: false, message: "Anda hanya dapat menghapus laporan yang Anda buat sendiri." };
    if (order.status !== "Pending Approval") return { ok: false, message: `Laporan berstatus ${order.status} tidak dapat dihapus. Hanya laporan Pending Approval yang bisa dihapus.` };
    await client.query("DELETE FROM notifications WHERE entity_type = 'outbound_order' AND entity_id = $1", [orderId]);
    await client.query("DELETE FROM outbound_orders WHERE id = $1", [orderId]);
    await logActivity(staff.id, "Hapus laporan barang keluar", { description: `${order.order_number} - ${order.customer_name}`, entityType: "outbound_order" }, client);
    await notifyRole("warehouse_manager", { title: "Laporan barang keluar dihapus", message: `${order.order_number} (${order.customer_name}) dihapus oleh ${staff.fullName} sebelum diputuskan.`, type: "outbound" }, client);
    return { ok: true, number: order.order_number };
  });
}
