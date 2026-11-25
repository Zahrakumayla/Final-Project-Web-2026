import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { number: "i.inspection_number", created: "i.created_at", status: "i.status", submitted: "i.submitted_at" };
export const INSPECTION_FILTERS = ["status", "approval"];
export const INSPECTION_STATUSES = ["Awaiting Inspection", "Under Inspection", "Not Found", "Inspection Completed"];
export const APPROVAL_STATUSES = ["Awaiting Approval", "Approved", "Revision Requested"];

const SELECT = `
  SELECT i.id, i.inspection_number, i.status, i.approval_status, i.instruction, i.started_at, i.submitted_at, i.submission_count,
         i.notes, i.not_found_note, i.not_found_at, i.revision_reason, i.approved_at, i.created_at, i.assigned_to, i.shipment_id,
         st.full_name AS inspector_name, mg.full_name AS assigned_by_name, ap.full_name AS approved_by_name,
         s.shipment_number, s.kind, s.arrival_photo_url, s.arrived_at, s.courier_name, s.tracking_number, s.claim_id,
         ro.id AS restock_order_id, ro.po_number, ro.order_date, ro.notes AS po_notes, su.company_name AS supplier_company,
         c.claim_number
  FROM inspections i
  JOIN users st ON st.id = i.assigned_to
  JOIN users mg ON mg.id = i.assigned_by
  LEFT JOIN users ap ON ap.id = i.approved_by
  JOIN inbound_shipments s ON s.id = i.shipment_id
  JOIN restock_orders ro ON ro.id = s.restock_order_id
  JOIN users su ON su.id = s.supplier_id
  LEFT JOIN claims c ON c.id = s.claim_id`;

const FROM_FOR_COUNT = `FROM inspections i JOIN users st ON st.id = i.assigned_to JOIN inbound_shipments s ON s.id = i.shipment_id
  JOIN restock_orders ro ON ro.id = s.restock_order_id JOIN users su ON su.id = s.supplier_id`;

function buildFilter(user, params) {
  const where = new WhereBuilder();
  // Staff hanya melihat tugas yang ditunjuk kepadanya
  if (user.role === "warehouse_staff") where.addWith("i.assigned_to = ?", user.id);
  where.search(["i.inspection_number", "ro.po_number", "s.shipment_number", "su.company_name", "st.full_name"], params.q);
  if (INSPECTION_STATUSES.includes(params.filters.status)) where.addWith("i.status = ?::inspection_status", params.filters.status);
  if (APPROVAL_STATUSES.includes(params.filters.approval)) where.addWith("i.approval_status = ?::approval_status", params.filters.approval);
  if (params.filters.status === "open") where.add("i.status IN ('Awaiting Inspection', 'Under Inspection')");
  return where;
}

export async function listInspections(user, searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: INSPECTION_FILTERS });
  const where = buildFilter(user, params);
  const total = (await query(`SELECT COUNT(*) AS total ${FROM_FOR_COUNT} ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, i.inspection_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

// Detail lengkap: detail PO asli tampil di halaman yang sama dengan form pemeriksaan.
export async function getInspection(user, inspectionId) {
  const { rows } = await query(`${SELECT} WHERE i.id = $1`, [inspectionId]);
  const inspection = rows[0];
  if (!inspection) return null;
  if (user.role === "warehouse_staff" && inspection.assigned_to !== user.id) return null;

  const [poItems, expected, items, mismatches, claims] = await Promise.all([
    query(
      `SELECT ri.quantity, ri.unit_price, ri.subtotal, p.id AS product_id, p.name, p.sku, p.unit
       FROM restock_order_items ri JOIN products p ON p.id = ri.product_id WHERE ri.restock_order_id = $1 ORDER BY p.name`,
      [inspection.restock_order_id],
    ),
    query(
      `SELECT si.product_id, si.quantity AS ordered_qty, p.name, p.sku, p.unit, p.image_url,
              (SELECT r.id FROM product_locations pl JOIN racks r ON r.id = pl.rack_id WHERE pl.product_id = p.id ORDER BY pl.quantity DESC, r.rack_code LIMIT 1) AS suggested_rack_id
       FROM inbound_shipment_items si JOIN products p ON p.id = si.product_id WHERE si.shipment_id = $1 ORDER BY p.name`,
      [inspection.shipment_id],
    ),
    query(
      `SELECT ii.*, p.name, p.sku, p.unit, r.rack_code FROM inspection_items ii
       JOIN products p ON p.id = ii.product_id LEFT JOIN racks r ON r.id = ii.rack_id
       WHERE ii.inspection_id = $1 ORDER BY p.name`,
      [inspectionId],
    ),
    query(
      `SELECT m.*, e.name AS expected_name, a.name AS actual_name, a.sku AS actual_sku FROM inspection_mismatches m
       JOIN products e ON e.id = m.expected_product_id LEFT JOIN products a ON a.id = m.actual_product_id
       WHERE m.inspection_id = $1 ORDER BY e.name`,
      [inspectionId],
    ),
    query(
      `SELECT c.id, c.claim_number, c.claim_type, c.quantity, c.status, c.product_id, c.requested_resolution, (c.quantity - c.resolved_quantity)::int AS remaining_quantity, p.name AS product_name
       FROM claims c JOIN products p ON p.id = c.product_id WHERE c.inspection_id = $1 ORDER BY c.claim_number`,
      [inspectionId],
    ),
  ]);
  return { ...inspection, poItems: poItems.rows, expected: expected.rows, items: items.rows, mismatches: mismatches.rows, claims: claims.rows };
}

async function lockInspection(client, inspectionId) {
  return (await client.query(
    `SELECT i.id, i.inspection_number, i.status, i.approval_status, i.assigned_to, i.shipment_id, i.assigned_by,
            s.shipment_number, s.kind, s.claim_id, s.supplier_id, ro.po_number, ro.id AS restock_order_id
     FROM inspections i JOIN inbound_shipments s ON s.id = i.shipment_id JOIN restock_orders ro ON ro.id = s.restock_order_id
     WHERE i.id = $1 FOR UPDATE OF i`,
    [inspectionId],
  )).rows[0];
}

// Staff yang ditunjuk: Mulai Periksa
export async function startInspection(staff, inspectionId) {
  return withTransaction(async (client) => {
    const ins = await lockInspection(client, inspectionId);
    if (!ins || ins.assigned_to !== staff.id) return { ok: false, message: "Tugas pemeriksaan tidak ditemukan." };
    if (ins.status !== "Awaiting Inspection") return { ok: false, message: "Pemeriksaan sudah dimulai. Proses ini sudah dilakukan." };
    await client.query("UPDATE inspections SET status = 'Under Inspection', updated_by = $2 WHERE id = $1", [inspectionId, staff.id]);
    await logActivity(staff.id, "Mulai periksa", { description: `${ins.inspection_number} (${ins.po_number})`, entityType: "inspection", entityId: inspectionId }, client);
    return { ok: true, number: ins.inspection_number };
  });
}

// Staff: Lapor Barang Tidak Ditemukan (pemeriksaan berhenti, Manager menindaklanjuti)
export async function reportNotFound(staff, inspectionId, note) {
  return withTransaction(async (client) => {
    const ins = await lockInspection(client, inspectionId);
    if (!ins || ins.assigned_to !== staff.id) return { ok: false, message: "Tugas pemeriksaan tidak ditemukan." };
    if (ins.status !== "Under Inspection" || ins.approval_status) return { ok: false, message: "Laporan Barang Tidak Ditemukan hanya dapat dibuat saat pemeriksaan berjalan." };
    await client.query("UPDATE inspections SET status = 'Not Found', not_found_note = $2, updated_by = $3 WHERE id = $1", [inspectionId, note, staff.id]);
    await logActivity(staff.id, "Lapor barang tidak ditemukan", { description: `${ins.inspection_number} - ${note}`, entityType: "inspection", entityId: inspectionId }, client);
    await notifyRole("warehouse_manager", {
      title: "Barang tidak ditemukan", message: `${ins.inspection_number} (${ins.shipment_number}): ${note}`,
      type: "inspection", entityType: "inspection", entityId: inspectionId, linkPath: `/manager/shipments/${ins.shipment_id}`,
    }, client);
    return { ok: true, number: ins.inspection_number };
  });
}

// Staff: Kirim Laporan Pemeriksaan (juga kirim ulang setelah revisi).
// Hasil sebelumnya diganti seluruhnya. URL foto lama yang tidak dipakai lagi dikembalikan
// agar file-nya dihapus SETELAH transaksi berhasil.
export async function submitInspection(staff, inspectionId, { items, mismatches, notes }) {
  return withTransaction(async (client) => {
    const ins = await lockInspection(client, inspectionId);
    if (!ins || ins.assigned_to !== staff.id) return { ok: false, message: "Tugas pemeriksaan tidak ditemukan." };
    if (ins.status !== "Under Inspection") return { ok: false, message: ins.status === "Inspection Completed" ? "Laporan sudah dikirim. Proses ini sudah dilakukan." : "Tekan Mulai Periksa terlebih dahulu." };

    const old = await client.query(
      "SELECT photo_url FROM inspection_items WHERE inspection_id = $1 AND photo_url IS NOT NULL UNION SELECT photo_url FROM inspection_mismatches WHERE inspection_id = $1",
      [inspectionId],
    );
    await client.query("DELETE FROM inspection_items WHERE inspection_id = $1", [inspectionId]);
    await client.query("DELETE FROM inspection_mismatches WHERE inspection_id = $1", [inspectionId]);

    for (const item of items) {
      await client.query(
        `INSERT INTO inspection_items (inspection_id, product_id, ordered_qty, received_qty, good_qty, damaged_qty, rack_id, note, photo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [inspectionId, item.productId, item.orderedQty, item.receivedQty, item.goodQty, item.damagedQty, item.goodQty > 0 ? item.rackId : null, item.note || null, item.photoUrl || null],
      );
    }
    for (const m of mismatches) {
      await client.query(
        `INSERT INTO inspection_mismatches (inspection_id, expected_product_id, actual_product_id, actual_description, quantity, note, photo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [inspectionId, m.expectedProductId, m.actualProductId || null, m.actualDescription || null, m.quantity, m.note, m.photoUrl],
      );
    }
    const resubmit = ins.approval_status === "Revision Requested";
    await client.query("UPDATE inspections SET status = 'Inspection Completed', notes = $2, updated_by = $3 WHERE id = $1", [inspectionId, notes || null, staff.id]);
    await logActivity(staff.id, resubmit ? "Kirim ulang laporan pemeriksaan" : "Kirim laporan pemeriksaan", { description: `${ins.inspection_number} (${ins.po_number})`, entityType: "inspection", entityId: inspectionId }, client);
    await notifyRole("warehouse_manager", {
      title: resubmit ? "Laporan pemeriksaan dikirim ulang" : "Laporan pemeriksaan menunggu persetujuan",
      message: `${ins.inspection_number} untuk ${ins.po_number} dikirim ${staff.fullName}.`,
      type: "inspection", entityType: "inspection", entityId: inspectionId, linkPath: `/manager/inspections/${inspectionId}`,
    }, client);

    const used = new Set([...items.map((i) => i.photoUrl), ...mismatches.map((m) => m.photoUrl)].filter(Boolean));
    return { ok: true, number: ins.inspection_number, unusedPhotos: old.rows.map((r) => r.photo_url).filter((url) => !used.has(url)) };
  });
}

// Manager: Setujui Pemeriksaan -> trigger database menambah stok & membuat klaim (satu transaksi).
// resolutions (opsional): { "Shortage:<productId>": "Refund" | "Replacement" } agar permintaan ke supplier
// langsung dikirim saat menyetujui laporan, tanpa perlu membuka menu Klaim lagi.
export async function approveInspection(manager, inspectionId, resolutions = {}) {
  return withTransaction(async (client) => {
    const ins = await lockInspection(client, inspectionId);
    if (!ins) return { ok: false, message: "Pemeriksaan tidak ditemukan." };
    if (ins.approval_status !== "Awaiting Approval") {
      return { ok: false, message: ins.approval_status === "Approved" ? "Pemeriksaan sudah disetujui. Proses ini sudah dilakukan." : "Pemeriksaan belum menunggu persetujuan." };
    }
    await client.query("UPDATE inspections SET approval_status = 'Approved', approved_by = $2, updated_by = $2 WHERE id = $1", [inspectionId, manager.id]);

    const good = (await client.query("SELECT COALESCE(SUM(good_qty), 0)::int AS total FROM inspection_items WHERE inspection_id = $1", [inspectionId])).rows[0].total;
    await logActivity(manager.id, "Setujui pemeriksaan", { description: `${ins.inspection_number} (${ins.po_number}) - stok +${good}`, entityType: "inspection", entityId: inspectionId }, client);
    await logActivity(manager.id, "Barang diterima ke stok", { description: `${ins.inspection_number}: +${good} unit baik`, entityType: "restock_order", entityId: ins.restock_order_id }, client);
    await notifyUser(ins.assigned_to, {
      title: "Pemeriksaan disetujui", message: `${ins.inspection_number} disetujui. Stok bertambah ${good} unit.`,
      type: "inspection", entityType: "inspection", entityId: inspectionId, linkPath: `/staff/inspections/${inspectionId}`,
    }, client);

    if (ins.kind === "PO") {
      const claims = (await client.query(
        `SELECT c.id, c.claim_number, c.claim_type, c.quantity, c.product_id, p.name FROM claims c JOIN products p ON p.id = c.product_id WHERE c.inspection_id = $1`,
        [inspectionId],
      )).rows;
      let requested = 0;
      for (const claim of claims) {
        const choice = resolutions[`${claim.claim_type}:${claim.product_id}`];
        if (choice === "Refund" || choice === "Replacement") {
          await client.query(
            "UPDATE claims SET requested_resolution = $2, requested_by = $3, requested_at = NOW(), updated_by = $3 WHERE id = $1",
            [claim.id, choice, manager.id],
          );
          await logActivity(manager.id, choice === "Refund" ? "Minta refund ke supplier" : "Minta barang pengganti ke supplier", { description: `${claim.claim_number} (${claim.quantity} unit)`, entityType: "claim", entityId: claim.id }, client);
          await notifyUser(ins.supplier_id, {
            title: choice === "Refund" ? "Klaim: Manager meminta refund" : "Klaim: Manager meminta barang pengganti",
            message: `${claim.claim_number} (${ins.po_number}): ${claim.name} ${claim.quantity} unit. Mohon ${choice === "Refund" ? "lakukan refund" : "kirim barang pengganti"}.`,
            type: "claim", entityType: "claim", entityId: claim.id, linkPath: `/supplier/claims/${claim.id}`,
          }, client);
          requested += 1;
        } else {
          await notifyUser(ins.supplier_id, {
            title: "Klaim barang bermasalah", message: `${claim.claim_number} (${ins.po_number}): ${claim.name} ${claim.quantity} unit. Manager akan memilih penyelesaian (barang pengganti atau refund).`,
            type: "claim", entityType: "claim", entityId: claim.id, linkPath: `/supplier/claims/${claim.id}`,
          }, client);
        }
      }
      const receipt = (await client.query("SELECT receipt_status FROM restock_orders WHERE id = $1", [ins.restock_order_id])).rows[0].receipt_status;
      return { ok: true, number: ins.inspection_number, good, claims: claims.length, requested, receipt };
    }

    const claim = (await client.query("SELECT id, claim_number, status, quantity, resolved_quantity FROM claims WHERE id = $1", [ins.claim_id])).rows[0];
    await logActivity(manager.id, claim.status === "Resolved" ? "Klaim selesai (pengganti diterima)" : "Pengganti diterima sebagian", { description: `${claim.claim_number}: ${claim.resolved_quantity}/${claim.quantity}`, entityType: "claim", entityId: claim.id }, client);
    await notifyUser(ins.supplier_id, {
      title: claim.status === "Resolved" ? "Klaim selesai" : "Barang pengganti masih kurang",
      message: claim.status === "Resolved"
        ? `${claim.claim_number}: barang pengganti diterima baik. Klaim ditutup.`
        : `${claim.claim_number}: diterima baik ${claim.resolved_quantity} dari ${claim.quantity}. Manager akan memilih penyelesaian untuk sisanya.`,
      type: "claim", entityType: "claim", entityId: claim.id, linkPath: `/supplier/claims/${claim.id}`,
    }, client);
    return { ok: true, number: ins.inspection_number, good, claims: 0 };
  });
}

// Manager: Minta Revisi (alasan wajib) -> Staff memperbaiki dan mengirim ulang
export async function requestRevision(manager, inspectionId, reason) {
  return withTransaction(async (client) => {
    const ins = await lockInspection(client, inspectionId);
    if (!ins) return { ok: false, message: "Pemeriksaan tidak ditemukan." };
    if (ins.approval_status !== "Awaiting Approval") return { ok: false, message: "Revisi hanya dapat diminta untuk laporan yang menunggu persetujuan." };
    await client.query("UPDATE inspections SET approval_status = 'Revision Requested', revision_reason = $2, updated_by = $3 WHERE id = $1", [inspectionId, reason, manager.id]);
    await logActivity(manager.id, "Minta revisi pemeriksaan", { description: `${ins.inspection_number} - ${reason}`, entityType: "inspection", entityId: inspectionId }, client);
    await notifyUser(ins.assigned_to, {
      title: "Revisi pemeriksaan diminta", message: `${ins.inspection_number}: ${reason}`,
      type: "inspection", entityType: "inspection", entityId: inspectionId, linkPath: `/staff/inspections/${inspectionId}`,
    }, client);
    return { ok: true, number: ins.inspection_number };
  });
}

// Laporan Staff yang menunggu persetujuan dan memuat temuan bermasalah. Ditampilkan di menu Klaim
// supaya Manager langsung tahu ada klaim yang akan dibuat dan bisa mengajukannya dari laporan tersebut.
export async function listProblemInspections() {
  const { rows } = await query(
    `SELECT i.id, i.inspection_number, ro.po_number, su.company_name AS supplier_company, i.submitted_at,
            (SELECT COUNT(*) FROM inspection_items ii WHERE ii.inspection_id = i.id AND (ii.damaged_qty > 0 OR ii.shortage_qty > 0))::int AS item_problems,
            (SELECT COUNT(*) FROM inspection_mismatches m WHERE m.inspection_id = i.id)::int AS mismatch_problems
     FROM inspections i
     JOIN inbound_shipments s ON s.id = i.shipment_id AND s.kind = 'PO'
     JOIN restock_orders ro ON ro.id = s.restock_order_id
     JOIN users su ON su.id = s.supplier_id
     WHERE i.approval_status = 'Awaiting Approval'
       AND (EXISTS (SELECT 1 FROM inspection_items ii WHERE ii.inspection_id = i.id AND (ii.damaged_qty > 0 OR ii.shortage_qty > 0))
            OR EXISTS (SELECT 1 FROM inspection_mismatches m WHERE m.inspection_id = i.id))
     ORDER BY i.submitted_at`,
  );
  return rows;
}
