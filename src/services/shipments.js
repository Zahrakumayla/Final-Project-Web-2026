import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

// Pengiriman barang masuk (PO dan barang pengganti klaim).
// Status pengiriman hanya diubah oleh tombol Supplier; Manager memantau
// lalu memerintahkan pemeriksaan setelah barang Arrived.

const SORTABLE = { number: "s.shipment_number", shipped: "s.shipped_at", status: "s.status" };
export const SHIPMENT_FILTERS = ["status", "kind", "stage", "from", "to"];
export const SHIPMENT_STATUS_OPTIONS = [
  ["In Transit", "Dalam perjalanan"], ["Arrived", "Tiba di gudang"], ["Awaiting Inspection", "Menunggu diperiksa"],
  ["Under Inspection", "Sedang diperiksa"], ["Awaiting Approval", "Menunggu persetujuan"], ["Approved", "Disetujui"],
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT = `
  SELECT s.id, s.shipment_number, s.kind, s.status, s.courier_name, s.tracking_number, s.notes, s.shipped_at, s.arrived_at,
         s.arrival_photo_url, s.restock_order_id, s.claim_id, s.supplier_id,
         ro.po_number, ro.order_date, ro.notes AS po_notes, su.company_name AS supplier_company, c.claim_number, c.claim_type,
         ins.id AS inspection_id, ins.inspection_number, ins.status AS inspection_status, ins.approval_status,
         st.full_name AS inspector_name,
         (SELECT COALESCE(SUM(quantity), 0)::int FROM inbound_shipment_items i WHERE i.shipment_id = s.id) AS total_quantity
  FROM inbound_shipments s
  JOIN restock_orders ro ON ro.id = s.restock_order_id
  JOIN users su ON su.id = s.supplier_id
  LEFT JOIN claims c ON c.id = s.claim_id
  LEFT JOIN LATERAL (SELECT * FROM inspections i WHERE i.shipment_id = s.id ORDER BY i.created_at DESC LIMIT 1) ins ON TRUE
  LEFT JOIN users st ON st.id = ins.assigned_to`;

function buildFilter(params) {
  const where = new WhereBuilder();
  where.search(["s.shipment_number", "ro.po_number", "su.company_name", "s.tracking_number", "c.claim_number"], params.q);
  const status = params.filters.status;
  if (["In Transit", "Arrived"].includes(status)) where.addWith("s.status = ?::inbound_status", status);
  if (["Awaiting Inspection", "Under Inspection"].includes(status)) where.addWith("ins.status = ?::inspection_status", status);
  if (status === "Awaiting Approval") where.add("ins.status = 'Inspection Completed' AND ins.approval_status = 'Awaiting Approval'");
  if (status === "Approved") where.add("ins.approval_status = 'Approved'");
  if (DATE.test(params.filters.from ?? "")) where.addWith("(s.shipped_at AT TIME ZONE 'Asia/Makassar')::date >= ?::date", params.filters.from);
  if (DATE.test(params.filters.to ?? "")) where.addWith("(s.shipped_at AT TIME ZONE 'Asia/Makassar')::date <= ?::date", params.filters.to);
  if (["PO", "Replacement"].includes(params.filters.kind)) where.addWith("s.kind = ?::shipment_kind", params.filters.kind);
  // "Perlu tindakan": sudah tiba tetapi belum ada pemeriksaan aktif
  if (params.filters.stage === "needs-inspection") where.add("s.status = 'Arrived' AND (ins.id IS NULL OR ins.status = 'Not Found')");
  if (params.filters.stage === "active") where.add("(s.status = 'In Transit' OR ins.id IS NULL OR ins.approval_status IS DISTINCT FROM 'Approved')");
  return where;
}

export async function listShipments(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "shipped", defaultDir: "desc", filters: SHIPMENT_FILTERS });
  const where = buildFilter(params);
  const base = `FROM inbound_shipments s JOIN restock_orders ro ON ro.id = s.restock_order_id JOIN users su ON su.id = s.supplier_id
                LEFT JOIN claims c ON c.id = s.claim_id
                LEFT JOIN LATERAL (SELECT * FROM inspections i WHERE i.shipment_id = s.id ORDER BY i.created_at DESC LIMIT 1) ins ON TRUE`;
  const total = (await query(`SELECT COUNT(*) AS total ${base} ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, s.shipment_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

// Manager: semua. Supplier: hanya miliknya.
export async function getShipment(user, shipmentId) {
  const { rows } = await query(`${SELECT} WHERE s.id = $1`, [shipmentId]);
  const shipment = rows[0];
  if (!shipment) return null;
  if (user.role === "supplier" && shipment.supplier_id !== user.id) return null;

  const [items, inspections] = await Promise.all([
    query(
      `SELECT i.product_id, i.quantity, p.name, p.sku, p.unit, p.image_url FROM inbound_shipment_items i
       JOIN products p ON p.id = i.product_id WHERE i.shipment_id = $1 ORDER BY p.name`,
      [shipmentId],
    ),
    query(
      `SELECT i.id, i.inspection_number, i.status, i.approval_status, i.created_at, i.not_found_note, u.full_name AS inspector_name
       FROM inspections i JOIN users u ON u.id = i.assigned_to WHERE i.shipment_id = $1 ORDER BY i.created_at DESC`,
      [shipmentId],
    ),
  ]);
  return { ...shipment, items: items.rows, inspections: inspections.rows };
}

export async function listActiveStaff() {
  const { rows } = await query(
    `SELECT u.id, u.full_name,
            (SELECT COUNT(*)::int FROM inspections i WHERE i.assigned_to = u.id AND i.status IN ('Awaiting Inspection', 'Under Inspection')) AS open_tasks
     FROM users u WHERE u.role = 'warehouse_staff' AND u.is_active ORDER BY u.full_name`,
  );
  return rows;
}

// Supplier menekan "Kirim Barang ke Gudang" untuk PO Confirmed (sekali per PO).
export async function shipPurchaseOrder(supplier, restockId, values) {
  return withTransaction(async (client) => {
    const po = (await client.query("SELECT id, po_number, supplier_id, status FROM restock_orders WHERE id = $1 FOR UPDATE", [restockId])).rows[0];
    if (!po || po.supplier_id !== supplier.id) return { ok: false, message: "Pesanan tidak ditemukan." };
    if (po.status !== "Confirmed") return { ok: false, message: "Barang hanya dapat dikirim untuk PO berstatus Confirmed." };
    const existing = await client.query("SELECT 1 FROM inbound_shipments WHERE restock_order_id = $1 AND kind = 'PO'", [restockId]);
    if (existing.rowCount) return { ok: false, message: "Barang untuk PO ini sudah dikirim. Proses ini sudah dilakukan." };

    const { rows } = await client.query(
      `INSERT INTO inbound_shipments (kind, restock_order_id, shipped_by, courier_name, tracking_number, notes)
       VALUES ('PO', $1, $2, $3, $4, $5) RETURNING id, shipment_number`,
      [restockId, supplier.id, values.courierName || null, values.trackingNumber || null, values.notes || null],
    );
    const shipment = rows[0];
    await logActivity(supplier.id, "Kirim barang ke gudang", { description: `${po.po_number} (${shipment.shipment_number})`, entityType: "restock_order", entityId: restockId }, client);
    await notifyRole("warehouse_manager", {
      title: "Barang dikirim supplier", message: `${po.po_number}: barang dalam perjalanan (${shipment.shipment_number}).`,
      type: "shipment", entityType: "inbound_shipment", entityId: shipment.id, linkPath: `/manager/shipments/${shipment.id}`,
    }, client);
    return { ok: true, number: shipment.shipment_number };
  });
}

// Supplier mengunggah foto bukti barang tiba -> Arrived
export async function markArrived(supplier, shipmentId, photoUrl) {
  return withTransaction(async (client) => {
    const shipment = (await client.query(
      `SELECT s.id, s.shipment_number, s.status, s.supplier_id, s.kind, s.restock_order_id, ro.po_number
       FROM inbound_shipments s JOIN restock_orders ro ON ro.id = s.restock_order_id WHERE s.id = $1 FOR UPDATE OF s`,
      [shipmentId],
    )).rows[0];
    if (!shipment || shipment.supplier_id !== supplier.id) return { ok: false, message: "Pengiriman tidak ditemukan." };
    if (shipment.status !== "In Transit") return { ok: false, message: "Bukti kedatangan sudah diunggah. Proses ini sudah dilakukan." };

    await client.query("UPDATE inbound_shipments SET status = 'Arrived', arrival_photo_url = $2, arrived_by = $3 WHERE id = $1", [shipmentId, photoUrl, supplier.id]);
    await logActivity(supplier.id, "Unggah foto barang tiba", { description: `${shipment.shipment_number} (${shipment.po_number})`, entityType: "restock_order", entityId: shipment.restock_order_id }, client);
    await notifyRole("warehouse_manager", {
      title: shipment.kind === "PO" ? "Barang tiba di gudang" : "Barang pengganti tiba",
      message: `${shipment.shipment_number} (${shipment.po_number}) sudah tiba. Lihat foto bukti dan perintahkan pemeriksaan.`,
      type: "shipment", entityType: "inbound_shipment", entityId: shipmentId, linkPath: `/manager/shipments/${shipmentId}`,
    }, client);
    return { ok: true, number: shipment.shipment_number, restockId: shipment.restock_order_id };
  });
}

// Manager: Perintahkan Pemeriksaan (menunjuk satu Staff), atau ganti Staff pada tugas aktif.
export async function assignInspection(manager, shipmentId, { staffId, instruction }) {
  return withTransaction(async (client) => {
    const shipment = (await client.query(
      `SELECT s.id, s.shipment_number, s.status, ro.po_number FROM inbound_shipments s JOIN restock_orders ro ON ro.id = s.restock_order_id
       WHERE s.id = $1 FOR UPDATE OF s`,
      [shipmentId],
    )).rows[0];
    if (!shipment) return { ok: false, message: "Pengiriman tidak ditemukan." };
    if (shipment.status !== "Arrived") return { ok: false, message: "Pemeriksaan hanya dapat diperintahkan setelah barang tiba (Arrived)." };
    const staff = (await client.query("SELECT id, full_name FROM users WHERE id = $1 AND role = 'warehouse_staff' AND is_active", [staffId])).rows[0];
    if (!staff) return { ok: false, message: "Staff tidak ditemukan atau tidak aktif." };

    const active = (await client.query("SELECT id, inspection_number, status, assigned_to FROM inspections WHERE shipment_id = $1 AND status <> 'Not Found' FOR UPDATE", [shipmentId])).rows[0];
    let inspection;
    if (active) {
      if (!["Awaiting Inspection", "Under Inspection"].includes(active.status)) return { ok: false, message: "Laporan pemeriksaan sudah dikirim. Staff tidak dapat diganti." };
      if (active.assigned_to === staffId) return { ok: false, message: `${staff.full_name} sudah ditunjuk untuk pemeriksaan ini.` };
      await client.query("UPDATE inspections SET assigned_to = $2, instruction = COALESCE(NULLIF($3, ''), instruction), updated_by = $4 WHERE id = $1", [active.id, staffId, instruction, manager.id]);
      inspection = { id: active.id, inspection_number: active.inspection_number };
      await notifyUser(active.assigned_to, { title: "Tugas pemeriksaan dialihkan", message: `${active.inspection_number} dialihkan ke Staff lain.`, type: "inspection", entityType: "inspection", entityId: active.id, linkPath: "/staff/inspections" }, client);
    } else {
      inspection = (await client.query(
        "INSERT INTO inspections (shipment_id, assigned_to, assigned_by, instruction, updated_by) VALUES ($1,$2,$3,$4,$3) RETURNING id, inspection_number",
        [shipmentId, staffId, manager.id, instruction || null],
      )).rows[0];
    }
    await logActivity(manager.id, active ? "Ganti Staff pemeriksa" : "Perintahkan pemeriksaan", { description: `${inspection.inspection_number} - ${shipment.shipment_number} -> ${staff.full_name}`, entityType: "inspection", entityId: inspection.id }, client);
    await notifyUser(staffId, {
      title: "Tugas pemeriksaan baru", message: `Anda ditunjuk memeriksa ${shipment.shipment_number} (${shipment.po_number}).${instruction ? ` Instruksi: ${instruction}` : ""}`,
      type: "inspection", entityType: "inspection", entityId: inspection.id, linkPath: `/staff/inspections/${inspection.id}`,
    }, client);
    return { ok: true, number: inspection.inspection_number, staffName: staff.full_name, reassigned: Boolean(active) };
  });
}
