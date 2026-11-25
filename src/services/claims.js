import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { number: "c.claim_number", created: "c.created_at", status: "c.status", type: "c.claim_type" };
export const CLAIM_FILTERS = ["status", "type"];
export const CLAIM_STATUSES = ["Claim Submitted", "Replacement In Transit", "Refund Processing", "Resolved", "Claim Rejected"];
export const CLAIM_TYPES = ["Shortage", "Damaged", "Wrong Item"];
export { CLAIM_TYPE_LABEL } from "@/lib/labels";

const SELECT = `
  SELECT c.*, (c.quantity - c.resolved_quantity) AS remaining_quantity,
         p.name AS product_name, p.sku, p.unit, p.buy_price, ap.name AS actual_product_name, ap.sku AS actual_sku,
         ro.po_number, su.company_name AS supplier_company, ins.inspection_number, rv.full_name AS resolved_by_name, rq.full_name AS requested_by_name,
         (SELECT unit_price FROM restock_order_items ri WHERE ri.restock_order_id = c.restock_order_id AND ri.product_id = c.product_id) AS unit_price
  FROM claims c
  JOIN products p ON p.id = c.product_id
  LEFT JOIN products ap ON ap.id = c.actual_product_id
  JOIN restock_orders ro ON ro.id = c.restock_order_id
  JOIN users su ON su.id = c.supplier_id
  JOIN inspections ins ON ins.id = c.inspection_id
  LEFT JOIN users rv ON rv.id = c.resolved_by
  LEFT JOIN users rq ON rq.id = c.requested_by`;

const FROM_FOR_COUNT = `FROM claims c JOIN products p ON p.id = c.product_id JOIN restock_orders ro ON ro.id = c.restock_order_id JOIN users su ON su.id = c.supplier_id`;

function buildFilter(user, params) {
  const where = new WhereBuilder();
  if (user.role === "supplier") where.addWith("c.supplier_id = ?", user.id);
  where.search(["c.claim_number", "ro.po_number", "p.name", "su.company_name"], params.q);
  if (CLAIM_STATUSES.includes(params.filters.status)) where.addWith("c.status = ?::claim_status", params.filters.status);
  if (params.filters.status === "open") where.add("c.status NOT IN ('Resolved', 'Claim Rejected')");
  if (CLAIM_TYPES.includes(params.filters.type)) where.addWith("c.claim_type = ?::claim_type", params.filters.type);
  return where;
}

export async function listClaims(user, searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "created", defaultDir: "desc", filters: CLAIM_FILTERS });
  const where = buildFilter(user, params);
  const total = (await query(`SELECT COUNT(*) AS total ${FROM_FOR_COUNT} ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, c.claim_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function getClaim(user, claimId) {
  const { rows } = await query(`${SELECT} WHERE c.id = $1`, [claimId]);
  const claim = rows[0];
  if (!claim) return null;
  if (user.role === "supplier" && claim.supplier_id !== user.id) return null;

  const [shipments, activity] = await Promise.all([
    query(
      `SELECT s.id, s.shipment_number, s.status, s.courier_name, s.tracking_number, s.notes, s.shipped_at, s.arrived_at, s.arrival_photo_url,
              (SELECT quantity FROM inbound_shipment_items si WHERE si.shipment_id = s.id LIMIT 1) AS quantity,
              ins.id AS inspection_id, ins.inspection_number, ins.status AS inspection_status, ins.approval_status, ins.notes AS inspection_notes,
              (SELECT SUM(good_qty) FROM inspection_items ii WHERE ii.inspection_id = ins.id)::int AS good_qty,
              (SELECT SUM(damaged_qty) FROM inspection_items ii WHERE ii.inspection_id = ins.id)::int AS damaged_qty,
              (SELECT SUM(shortage_qty) FROM inspection_items ii WHERE ii.inspection_id = ins.id)::int AS shortage_qty,
              (SELECT COALESCE(ARRAY_AGG(ii.photo_url) FILTER (WHERE ii.photo_url IS NOT NULL), '{}') FROM inspection_items ii WHERE ii.inspection_id = ins.id) AS evidence_photos
       FROM inbound_shipments s
       LEFT JOIN LATERAL (SELECT * FROM inspections i WHERE i.shipment_id = s.id ORDER BY i.created_at DESC LIMIT 1) ins ON TRUE
       WHERE s.claim_id = $1 ORDER BY s.shipped_at`,
      [claimId],
    ),
    query(
      `SELECT a.activity, a.description, a.created_at, u.full_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = 'claim' AND a.entity_id = $1 ORDER BY a.created_at`,
      [claimId],
    ),
  ]);
  return { ...claim, shipments: shipments.rows, activity: activity.rows };
}

async function lockClaim(client, claimId) {
  return (await client.query(
    `SELECT c.*, (c.quantity - c.resolved_quantity) AS remaining, ro.po_number FROM claims c
     JOIN restock_orders ro ON ro.id = c.restock_order_id WHERE c.id = $1 FOR UPDATE OF c`,
    [claimId],
  )).rows[0];
}

const managerLink = (id) => `/manager/claims/${id}`;
const supplierLink = (id) => `/supplier/claims/${id}`;

function requestMismatchMessage(claim, wanted) {
  if (!claim.requested_resolution) return "Manager belum memilih penyelesaian klaim ini. Tunggu permintaan dari Manager.";
  return `Manager meminta ${claim.requested_resolution === "Refund" ? "refund" : "barang pengganti"}, bukan ${wanted === "Refund" ? "refund" : "barang pengganti"}.`;
}

// Manager: pilih penyelesaian klaim (barang pengganti atau refund). Boleh diubah selama Supplier belum menjalankannya.
export async function requestResolution(manager, claimId, resolution, note) {
  if (!["Replacement", "Refund"].includes(resolution)) return { ok: false, message: "Pilihan penyelesaian tidak valid." };
  return withTransaction(async (client) => {
    const claim = await lockClaim(client, claimId);
    if (!claim) return { ok: false, message: "Klaim tidak ditemukan." };
    if (claim.status !== "Claim Submitted") return { ok: false, message: `Klaim berstatus ${claim.status}. Penyelesaian hanya dapat dipilih saat Claim Submitted.` };
    const label = resolution === "Refund" ? "refund" : "barang pengganti";
    await client.query(
      "UPDATE claims SET requested_resolution = $2, requested_by = $3, requested_at = NOW(), request_note = $4, updated_by = $3 WHERE id = $1",
      [claimId, resolution, manager.id, note || null],
    );
    await logActivity(manager.id, resolution === "Refund" ? "Minta refund ke supplier" : "Minta barang pengganti ke supplier", { description: `${claim.claim_number} (${claim.remaining} unit)${note ? ` - ${note}` : ""}`, entityType: "claim", entityId: claimId }, client);
    await notifyUser(claim.supplier_id, {
      title: resolution === "Refund" ? "Manager meminta refund" : "Manager meminta barang pengganti",
      message: `${claim.claim_number} (${claim.po_number}): mohon ${resolution === "Refund" ? "lakukan refund" : "kirim barang pengganti"} untuk ${claim.remaining} unit.${note ? ` Catatan: ${note}` : ""}`,
      type: "claim", entityType: "claim", entityId: claimId, linkPath: supplierLink(claimId),
    }, client);
    return { ok: true, number: claim.claim_number, label };
  });
}

// Supplier: kirim barang pengganti -> pengiriman pengganti yang terhubung ke PO & klaim (bukan PO baru)
export async function sendReplacement(supplier, claimId, values) {
  return withTransaction(async (client) => {
    const claim = await lockClaim(client, claimId);
    if (!claim || claim.supplier_id !== supplier.id) return { ok: false, message: "Klaim tidak ditemukan." };
    if (claim.status !== "Claim Submitted") return { ok: false, message: `Klaim berstatus ${claim.status}. Proses ini sudah dilakukan atau tidak tersedia.` };
    if (claim.requested_resolution !== "Replacement") return { ok: false, message: requestMismatchMessage(claim, "Replacement") };

    const shipment = (await client.query(
      `INSERT INTO inbound_shipments (kind, restock_order_id, claim_id, shipped_by, courier_name, tracking_number, notes)
       VALUES ('Replacement', $1, $2, $3, $4, $5, $6) RETURNING id, shipment_number`,
      [claim.restock_order_id, claimId, supplier.id, values.courierName || null, values.trackingNumber || null, values.notes || null],
    )).rows[0];
    await logActivity(supplier.id, "Kirim barang pengganti", { description: `${claim.claim_number} - ${shipment.shipment_number} (${claim.remaining} unit)`, entityType: "claim", entityId: claimId }, client);
    const message = { title: "Barang pengganti dikirim", message: `${claim.claim_number} (${claim.po_number}): pengganti ${claim.remaining} unit dalam perjalanan (${shipment.shipment_number}).`, type: "claim", entityType: "inbound_shipment", entityId: shipment.id };
    await notifyRole("warehouse_manager", { ...message, linkPath: `/manager/shipments/${shipment.id}` }, client);
    await notifyRole("warehouse_staff", { ...message, linkPath: "/staff/inspections" }, client);
    return { ok: true, number: shipment.shipment_number };
  });
}

// Supplier: catat refund + unggah bukti (juga unggah ulang bila bukti ditolak)
export async function submitRefund(supplier, claimId, { amountValue, reference }, proofUrl) {
  return withTransaction(async (client) => {
    const claim = await lockClaim(client, claimId);
    if (!claim || claim.supplier_id !== supplier.id) return { ok: false, message: "Klaim tidak ditemukan." };
    let previousProof = null;
    if (claim.status === "Claim Submitted") {
      if (claim.requested_resolution !== "Refund") return { ok: false, message: requestMismatchMessage(claim, "Refund") };
      await client.query(
        `UPDATE claims SET status = 'Refund Processing', refund_amount = $2, refund_reference = $3, refund_proof_url = $4,
                refund_rejection_reason = NULL, updated_by = $5 WHERE id = $1`,
        [claimId, amountValue, reference, proofUrl, supplier.id],
      );
    } else if (claim.status === "Refund Processing" && claim.refund_proof_invalid) {
      previousProof = claim.refund_proof_url;
      await client.query(
        `UPDATE claims SET refund_amount = $2, refund_reference = $3, refund_proof_url = $4, refund_proof_invalid = FALSE,
                refund_submitted_at = NOW(), updated_by = $5 WHERE id = $1`,
        [claimId, amountValue, reference, proofUrl, supplier.id],
      );
    } else {
      return { ok: false, message: claim.status === "Refund Processing" ? "Bukti refund sudah diajukan dan sedang diverifikasi." : `Klaim berstatus ${claim.status}.` };
    }
    await logActivity(supplier.id, previousProof ? "Unggah ulang bukti refund" : "Ajukan refund", { description: `${claim.claim_number}: Rp ${amountValue.toLocaleString("id-ID")} (${reference})`, entityType: "claim", entityId: claimId }, client);
    await notifyRole("warehouse_manager", {
      title: previousProof ? "Bukti refund diunggah ulang" : "Refund diajukan", message: `${claim.claim_number} (${claim.po_number}): Rp ${amountValue.toLocaleString("id-ID")}. Mohon verifikasi bukti.`,
      type: "claim", entityType: "claim", entityId: claimId, linkPath: managerLink(claimId),
    }, client);
    return { ok: true, number: claim.claim_number, previousProof };
  });
}

// Manager: verifikasi bukti refund. valid -> Resolved ; tidak valid -> tetap Refund Processing, minta unggah ulang
export async function verifyRefund(manager, claimId, valid, reason) {
  return withTransaction(async (client) => {
    const claim = await lockClaim(client, claimId);
    if (!claim) return { ok: false, message: "Klaim tidak ditemukan." };
    if (claim.status !== "Refund Processing") return { ok: false, message: claim.status === "Resolved" ? "Klaim sudah selesai. Proses ini sudah dilakukan." : "Klaim tidak sedang menunggu verifikasi refund." };
    if (claim.refund_proof_invalid) return { ok: false, message: "Menunggu Supplier mengunggah ulang bukti refund." };
    if (valid) {
      await client.query(
        "UPDATE claims SET status = 'Resolved', resolved_by = $2, resolution_note = $3, updated_by = $2 WHERE id = $1",
        [claimId, manager.id, `Refund Rp ${Number(claim.refund_amount).toLocaleString("id-ID")} terverifikasi (${claim.refund_reference ?? "-"}).`],
      );
    } else {
      await client.query("UPDATE claims SET refund_proof_invalid = TRUE, refund_rejection_reason = $2, updated_by = $3 WHERE id = $1", [claimId, reason, manager.id]);
    }
    await logActivity(manager.id, valid ? "Verifikasi refund valid" : "Bukti refund tidak valid", { description: `${claim.claim_number}${reason ? ` - ${reason}` : ""}`, entityType: "claim", entityId: claimId }, client);
    await notifyUser(claim.supplier_id, {
      title: valid ? "Klaim selesai" : "Bukti refund tidak valid",
      message: valid ? `${claim.claim_number}: refund terverifikasi, klaim ditutup.` : `${claim.claim_number}: ${reason}. Silakan unggah ulang bukti refund.`,
      type: "claim", entityType: "claim", entityId: claimId, linkPath: supplierLink(claimId),
    }, client);
    return { ok: true, number: claim.claim_number };
  });
}
