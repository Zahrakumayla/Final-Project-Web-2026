import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { number: "t.transaction_number", status: "s.delivery_status", eta: "s.estimated_arrival_date", date: "s.created_at" };
const STATUSES = ["Waiting", "Preparing", "Ready to Ship", "Shipped", "Delivered", "Delivery Issue"];

// Urutan status yang diizinkan (sama dengan trigger guard_shipment_update di database).
export const NEXT_STATUS = {
  Waiting: ["Preparing"],
  Preparing: ["Ready to Ship"],
  "Ready to Ship": ["Shipped", "Delivery Issue"],
  Shipped: ["Delivered", "Delivery Issue"],
  "Delivery Issue": ["Shipped", "Delivered"],
  Delivered: [],
};

const SELECT = `
  SELECT s.id, s.transaction_id, s.delivery_status, s.actual_ship_date, s.estimated_arrival_date, s.courier_name, s.tracking_number, s.notes,
         s.created_at, s.updated_at, t.transaction_number, t.customer_name, t.transaction_date,
         (SELECT COALESCE(SUM(quantity),0)::int FROM transaction_items i WHERE i.transaction_id = t.id) AS total_quantity,
         u.full_name AS updated_by_name
  FROM shipments s JOIN transactions t ON t.id = s.transaction_id LEFT JOIN users u ON u.id = s.updated_by`;

function buildFilter(params) {
  const where = new WhereBuilder();
  where.search(["t.transaction_number", "t.customer_name", "s.tracking_number", "s.courier_name"], params.q);
  if (STATUSES.includes(params.filters.status)) where.addWith("s.delivery_status = ?::delivery_status", params.filters.status);
  return where;
}

export async function listShipments(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: ["status"] });
  const where = buildFilter(params);
  const total = (await query(`SELECT COUNT(*) AS total FROM shipments s JOIN transactions t ON t.id = s.transaction_id ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, t.transaction_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function getShipment(shipmentId) {
  const { rows } = await query(`${SELECT} WHERE s.id = $1`, [shipmentId]);
  const shipment = rows[0];
  if (!shipment) return null;
  const [history, items] = await Promise.all([
    query(
      `SELECT su.status, su.notes, su.created_at, u.full_name FROM shipment_updates su LEFT JOIN users u ON u.id = su.updated_by
       WHERE su.shipment_id = $1 ORDER BY su.created_at, su.id`,
      [shipmentId],
    ),
    query(
      `SELECT p.name, p.sku, p.unit, i.quantity, r.rack_code FROM transaction_items i
       JOIN products p ON p.id = i.product_id JOIN racks r ON r.id = i.rack_id WHERE i.transaction_id = $1 ORDER BY p.name`,
      [shipment.transaction_id],
    ),
  ]);
  return { ...shipment, history: history.rows, items: items.rows };
}

// Staff memperbarui status & info kirim. Perubahan status divalidasi ganda: di sini dan oleh trigger database.
export async function updateShipment(staff, shipmentId, values) {
  return withTransaction(async (client) => {
    const current = (
      await client.query(
        "SELECT s.delivery_status, s.transaction_id, t.transaction_number FROM shipments s JOIN transactions t ON t.id = s.transaction_id WHERE s.id = $1 FOR UPDATE OF s",
        [shipmentId],
      )
    ).rows[0];
    if (!current) return { ok: false, message: "Pengiriman tidak ditemukan." };

    const changing = values.status && values.status !== current.delivery_status;
    if (changing && !NEXT_STATUS[current.delivery_status].includes(values.status)) {
      return { ok: false, message: `Status ${current.delivery_status} tidak dapat langsung menjadi ${values.status}.` };
    }
    if (changing && values.status === "Delivery Issue" && !values.notes) return { ok: false, message: "Catatan wajib diisi untuk status Delivery Issue.", field: "notes" };
    if (changing && values.status === "Shipped" && !(values.courierName || (await client.query("SELECT courier_name FROM shipments WHERE id = $1", [shipmentId])).rows[0].courier_name)) {
      return { ok: false, message: "Isi nama kurir sebelum menandai Shipped.", field: "courierName" };
    }

    await client.query(
      `UPDATE shipments SET courier_name = COALESCE($2, courier_name), tracking_number = COALESCE($3, tracking_number),
              estimated_arrival_date = COALESCE($4::date, estimated_arrival_date), notes = COALESCE($5, notes),
              delivery_status = $6::delivery_status, updated_by = $7 WHERE id = $1`,
      [shipmentId, values.courierName || null, values.trackingNumber || null, values.estimatedDate || null, values.notes || null, changing ? values.status : current.delivery_status, staff.id],
    );
    await logActivity(staff.id, changing ? `Pengiriman menjadi ${values.status}` : "Ubah info pengiriman", { description: current.transaction_number, entityType: "shipment", entityId: shipmentId }, client);
    if (changing && ["Shipped", "Delivered", "Delivery Issue"].includes(values.status)) {
      await notifyRole("warehouse_manager", {
        title: values.status === "Delivery Issue" ? "Masalah pengiriman" : `Pengiriman ${values.status}`,
        message: `${current.transaction_number}: ${values.status}${values.status === "Delivery Issue" && values.notes ? ` - ${values.notes}` : ""}`,
        type: "issue", entityType: "shipment", entityId: shipmentId, linkPath: `/manager/deliveries/${shipmentId}`,
      }, client);
    }
    return { ok: true, number: current.transaction_number };
  });
}
