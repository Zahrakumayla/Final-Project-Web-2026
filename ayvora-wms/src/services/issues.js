import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { notifyRole, notifyUser } from "@/lib/notify";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { number: "i.issue_number", date: "i.created_at", status: "i.status", type: "i.issue_type" };
const TYPES = ["Lost in Transit", "Late Delivery", "Quantity Mismatch", "Damaged Goods", "Outbound Issue"];
const REMEDY_TYPES = ["Lost in Transit", "Quantity Mismatch", "Damaged Goods"];
const STATUSES = ["Open", "Under Review", "Resolved", "Dismissed"];

const SELECT = `
  SELECT i.id, i.issue_number, i.issue_type, i.status, i.description, i.evidence_url, i.resolution_note, i.resolved_at, i.created_at,
         i.reported_by, i.restock_order_id, i.transaction_id,
         i.remedy, i.remedy_status, i.remedy_supplier_id, i.refund_amount, i.remedy_note, i.remedy_eta, i.remedy_responded_at, i.replacement_transaction_id,
         rs.company_name AS remedy_supplier_name, rt.transaction_number AS replacement_number,
         ru.full_name AS reporter_name, ru.role AS reporter_role, ru.company_name AS reporter_company,
         rv.full_name AS resolver_name, ro.po_number, t.transaction_number, t.type AS transaction_type
  FROM issue_reports i
  JOIN users ru ON ru.id = i.reported_by
  LEFT JOIN users rv ON rv.id = i.resolved_by
  LEFT JOIN users rs ON rs.id = i.remedy_supplier_id
  LEFT JOIN transactions rt ON rt.id = i.replacement_transaction_id
  LEFT JOIN restock_orders ro ON ro.id = i.restock_order_id
  LEFT JOIN transactions t ON t.id = i.transaction_id`;

function buildFilter(user, params) {
  const where = new WhereBuilder();
  // Staff & supplier hanya melihat laporan miliknya sendiri
  if (user.role === "supplier") { const me = where.param(user.id); where.add(`(i.reported_by = ${me} OR i.remedy_supplier_id = ${me})`); }
  else if (user.role !== "warehouse_manager") where.addWith("i.reported_by = ?", user.id);
  where.search(["i.issue_number", "i.description", "ru.full_name", "ro.po_number", "t.transaction_number"], params.q);
  if (STATUSES.includes(params.filters.status)) where.addWith("i.status = ?::issue_status", params.filters.status);
  if (TYPES.includes(params.filters.type)) where.addWith("i.issue_type = ?::issue_type", params.filters.type);
  return where;
}

export async function listIssues(user, searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "date", defaultDir: "desc", filters: ["status", "type"] });
  const where = buildFilter(user, params);
  const total = (await query(`SELECT COUNT(*) AS total FROM issue_reports i JOIN users ru ON ru.id = i.reported_by LEFT JOIN restock_orders ro ON ro.id = i.restock_order_id LEFT JOIN transactions t ON t.id = i.transaction_id ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(`${SELECT} ${where.sql} ORDER BY ${params.orderBy}, i.issue_number DESC LIMIT ${limit} OFFSET ${offset}`, where.values);
  return { rows, params, info: pageInfo(params, total) };
}

export async function getIssue(user, issueId) {
  const { rows } = await query(`${SELECT} WHERE i.id = $1`, [issueId]);
  const issue = rows[0];
  if (!issue) return null;
  const involved = issue.reported_by === user.id || issue.remedy_supplier_id === user.id;
  if (user.role !== "warehouse_manager" && !involved) return null;
  const items = await query(
    `SELECT p.name, p.sku, p.unit, ii.quantity FROM issue_report_items ii JOIN products p ON p.id = ii.product_id WHERE ii.issue_report_id = $1`,
    [issueId],
  );
  return { ...issue, items: items.rows };
}

// Acuan yang boleh dipilih pelapor: PO milik supplier, atau transaksi milik staff
export async function listReferences(user) {
  if (user.role === "supplier") {
    const { rows } = await query(
      `SELECT id, po_number AS label, 'restock' AS ref FROM restock_orders WHERE supplier_id = $1 AND status IN ('Confirmed','In Transit','Received') ORDER BY created_at DESC`,
      [user.id],
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT id, transaction_number AS label, CASE type WHEN 'INCOMING' THEN 'incoming' ELSE 'outgoing' END AS ref
     FROM transactions WHERE created_by = $1 AND status <> 'Rejected' ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  );
  return rows;
}

export async function listIssueProducts() {
  const { rows } = await query("SELECT id, name, sku FROM products ORDER BY name");
  return rows;
}

export async function createIssue(user, values, typeInfo, evidenceUrl) {
  return withTransaction(async (client) => {
    let restockId = null; let transactionId = null; let refLabel;
    if (typeInfo.ref === "restock") {
      const po = (await client.query("SELECT id, po_number FROM restock_orders WHERE id = $1 AND supplier_id = $2 AND status IN ('Confirmed','In Transit','Received')", [values.referenceId, user.id])).rows[0];
      if (!po) return { ok: false, message: "PO tidak ditemukan atau bukan milik Anda." };
      restockId = po.id; refLabel = po.po_number;
    } else {
      const wanted = typeInfo.ref === "incoming" ? "INCOMING" : "OUTGOING";
      const tx = (await client.query("SELECT id, transaction_number FROM transactions WHERE id = $1 AND created_by = $2 AND type = $3::transaction_type AND status <> 'Rejected'", [values.referenceId, user.id, wanted])).rows[0];
      if (!tx) return { ok: false, message: "Transaksi tidak ditemukan atau tidak sesuai jenis masalah." };
      transactionId = tx.id; refLabel = tx.transaction_number;
    }
    if (values.productId) {
      const exists = await client.query("SELECT 1 FROM products WHERE id = $1", [values.productId]);
      if (!exists.rowCount) return { ok: false, message: "Produk tidak ditemukan." };
    }
    const { rows } = await client.query(
      `INSERT INTO issue_reports (issue_type, restock_order_id, transaction_id, reported_by, description, evidence_url)
       VALUES ($1::issue_type,$2,$3,$4,$5,$6) RETURNING id, issue_number`,
      [values.type, restockId, transactionId, user.id, values.description, evidenceUrl],
    );
    const issue = rows[0];
    if (values.productId) await client.query("INSERT INTO issue_report_items (issue_report_id, product_id, quantity) VALUES ($1,$2,$3)", [issue.id, values.productId, values.quantity]);
    await logActivity(user.id, "Buat laporan masalah", { description: `${issue.issue_number} (${values.type}) - ${refLabel}`, entityType: "issue", entityId: issue.id }, client);
    await notifyRole("warehouse_manager", { title: "Laporan masalah baru", message: `${issue.issue_number}: ${values.type} pada ${refLabel}.`, type: "issue", entityType: "issue", entityId: issue.id, linkPath: `/manager/issues/${issue.id}` }, client);
    return { ok: true, id: issue.id, number: issue.issue_number };
  });
}

// Manager: Under Review / Resolved / Dismissed
export async function resolveIssue(manager, issueId, { status, note }) {
  return withTransaction(async (client) => {
    const issue = (await client.query("SELECT id, issue_number, status, reported_by, remedy, remedy_status, (SELECT role FROM users WHERE id = reported_by) AS reporter_role FROM issue_reports WHERE id = $1 FOR UPDATE", [issueId])).rows[0];
    if (!issue) return { ok: false, message: "Laporan tidak ditemukan." };
    if (["Resolved", "Dismissed"].includes(issue.status)) return { ok: false, message: `Laporan sudah ${issue.status}.` };
    if (issue.status === status) return { ok: false, message: `Laporan sudah berstatus ${status}.` };

    if (issue.remedy && status === "Dismissed") return { ok: false, message: "Laporan dengan permintaan pengganti/refund tidak dapat ditutup sebagai Dismissed." };
    if (issue.remedy && status === "Resolved") return { ok: false, message: "Laporan ini selesai otomatis saat barang pengganti diterima atau refund dikonfirmasi." };
    const closed = ["Resolved", "Dismissed"].includes(status);
    await client.query(
      `UPDATE issue_reports SET status = $2::issue_status, resolution_note = $3, resolved_by = $4, resolved_at = CASE WHEN $5 THEN now() END WHERE id = $1`,
      [issueId, status, note || null, closed ? manager.id : null, closed],
    );
    await logActivity(manager.id, `Laporan menjadi ${status}`, { description: issue.issue_number, entityType: "issue", entityId: issueId }, client);
    await notifyUser(issue.reported_by, {
      title: `Laporan ${status}`, message: `${issue.issue_number} kini ${status}${note ? `: ${note}` : ""}`, type: "issue", entityType: "issue", entityId: issueId,
      linkPath: `/${issue.reporter_role === "supplier" ? "supplier" : "staff"}/issues/${issueId}`,
    }, client);
    return { ok: true, number: issue.issue_number };
  });
}

// Supplier yang bertanggung jawab atas barang: pemilik PO, atau supplier pada transaksi barang masuk
async function findResponsibleSupplier(client, issue) {
  if (issue.restock_order_id) return (await client.query("SELECT supplier_id FROM restock_orders WHERE id = $1", [issue.restock_order_id])).rows[0]?.supplier_id ?? null;
  if (issue.transaction_id) return (await client.query("SELECT supplier_id FROM transactions WHERE id = $1 AND type = 'INCOMING'", [issue.transaction_id])).rows[0]?.supplier_id ?? null;
  return null;
}

// Manager meminta barang pengganti atau refund kepada supplier
export async function requestRemedy(manager, issueId, { remedy, amount, note }) {
  return withTransaction(async (client) => {
    const issue = (await client.query("SELECT * FROM issue_reports WHERE id = $1 FOR UPDATE", [issueId])).rows[0];
    if (!issue) return { ok: false, message: "Laporan tidak ditemukan." };
    if (["Resolved", "Dismissed"].includes(issue.status)) return { ok: false, message: `Laporan sudah ${issue.status}.` };
    if (issue.remedy) return { ok: false, message: "Permintaan penyelesaian sudah dibuat untuk laporan ini." };
    if (!REMEDY_TYPES.includes(issue.issue_type)) return { ok: false, message: "Jenis masalah ini tidak memerlukan pengganti atau refund." };
    const supplierId = await findResponsibleSupplier(client, issue);
    if (!supplierId) return { ok: false, message: "Supplier penanggung jawab tidak ditemukan (laporan tidak terhubung ke PO atau barang masuk)." };

    await client.query(
      `UPDATE issue_reports SET status = 'Under Review', remedy = $2::issue_remedy, remedy_status = 'Requested', remedy_supplier_id = $3,
              refund_amount = $4, resolution_note = COALESCE($5, resolution_note) WHERE id = $1`,
      [issueId, remedy, supplierId, remedy === "Refund" ? amount : null, note || null],
    );
    const label = remedy === "Replacement" ? "barang pengganti" : "refund";
    await logActivity(manager.id, `Minta ${label}`, { description: issue.issue_number, entityType: "issue", entityId: issueId }, client);
    await notifyUser(supplierId, { title: `Diminta ${label}`, message: `${issue.issue_number}: Warehouse Manager meminta ${label}${remedy === "Refund" ? ` sebesar Rp ${Number(amount).toLocaleString("id-ID")}` : ""}.`, type: "issue", entityType: "issue", entityId: issueId, linkPath: `/supplier/issues/${issueId}` }, client);
    const reporterRole = (await client.query("SELECT role FROM users WHERE id = $1", [issue.reported_by])).rows[0].role;
    if (issue.reported_by !== supplierId) await notifyUser(issue.reported_by, { title: "Laporan ditindaklanjuti", message: `${issue.issue_number}: ${label} diminta dari supplier.`, type: "issue", entityType: "issue", entityId: issueId, linkPath: `/${reporterRole === "supplier" ? "supplier" : "staff"}/issues/${issueId}` }, client);
    return { ok: true, number: issue.issue_number };
  });
}

// Supplier menyatakan barang pengganti sudah dikirim / refund sudah dibayar
export async function respondRemedy(supplier, issueId, { note, eta }) {
  return withTransaction(async (client) => {
    const issue = (await client.query("SELECT id, issue_number, remedy, remedy_status, remedy_supplier_id FROM issue_reports WHERE id = $1 FOR UPDATE", [issueId])).rows[0];
    if (!issue || issue.remedy_supplier_id !== supplier.id) return { ok: false, message: "Laporan tidak ditemukan." };
    if (issue.remedy_status !== "Requested") return { ok: false, message: "Permintaan ini sudah ditanggapi." };
    await client.query(
      "UPDATE issue_reports SET remedy_status = 'In Progress', remedy_note = $2, remedy_eta = $3, remedy_responded_at = now() WHERE id = $1",
      [issueId, note, issue.remedy === "Replacement" ? eta : null],
    );
    await logActivity(supplier.id, issue.remedy === "Replacement" ? "Kirim barang pengganti" : "Lakukan refund", { description: issue.issue_number, entityType: "issue", entityId: issueId }, client);
    await notifyRole("warehouse_manager", { title: issue.remedy === "Replacement" ? "Barang pengganti dikirim" : "Refund dilakukan", message: `${issue.issue_number}: ${supplier.companyName ?? supplier.fullName} menanggapi permintaan.`, type: "issue", entityType: "issue", entityId: issueId, linkPath: `/manager/issues/${issueId}` }, client);
    return { ok: true, number: issue.issue_number };
  });
}

// Barang masuk Approved dari supplier terkait yang belum dipakai laporan lain
export async function listReplacementCandidates(supplierId) {
  const { rows } = await query(
    `SELECT t.id, t.transaction_number, t.transaction_date FROM transactions t
     WHERE t.type = 'INCOMING' AND t.status = 'Approved' AND t.supplier_id = $1
       AND NOT EXISTS (SELECT 1 FROM issue_reports i WHERE i.replacement_transaction_id = t.id)
     ORDER BY t.created_at DESC LIMIT 50`,
    [supplierId],
  );
  return rows;
}

// Manager mengonfirmasi: pengganti diterima (lewat transaksi barang masuk Approved) atau refund diterima
export async function completeRemedy(manager, issueId, { transactionId }) {
  return withTransaction(async (client) => {
    const issue = (await client.query("SELECT * FROM issue_reports WHERE id = $1 FOR UPDATE", [issueId])).rows[0];
    if (!issue || !issue.remedy) return { ok: false, message: "Laporan tidak ditemukan." };
    if (issue.remedy_status !== "In Progress") return { ok: false, message: issue.remedy_status === "Completed" ? "Penyelesaian sudah dikonfirmasi." : "Supplier belum menanggapi permintaan ini." };
    let linked = null;
    if (issue.remedy === "Replacement") {
      if (!transactionId) return { ok: false, message: "Pilih transaksi barang masuk yang mencatat barang pengganti." };
      const tx = (await client.query("SELECT id, transaction_number FROM transactions WHERE id = $1 AND type = 'INCOMING' AND status = 'Approved' AND supplier_id = $2", [transactionId, issue.remedy_supplier_id])).rows[0];
      if (!tx) return { ok: false, message: "Transaksi tidak valid: harus barang masuk Approved dari supplier yang sama." };
      linked = tx;
    }
    const note = issue.remedy === "Replacement" ? `Barang pengganti diterima (${linked.transaction_number}).` : `Refund Rp ${Number(issue.refund_amount).toLocaleString("id-ID")} dikonfirmasi.`;
    await client.query(
      `UPDATE issue_reports SET remedy_status = 'Completed', replacement_transaction_id = $2, status = 'Resolved',
              resolution_note = $3, resolved_by = $4, resolved_at = now() WHERE id = $1`,
      [issueId, linked?.id ?? null, note, manager.id],
    );
    await logActivity(manager.id, "Konfirmasi penyelesaian masalah", { description: `${issue.issue_number} - ${note}`, entityType: "issue", entityId: issueId }, client);
    const reporterRole = (await client.query("SELECT role FROM users WHERE id = $1", [issue.reported_by])).rows[0].role;
    const msg = { title: "Laporan selesai", message: `${issue.issue_number}: ${note}`, type: "issue", entityType: "issue", entityId: issueId };
    await notifyUser(issue.remedy_supplier_id, { ...msg, linkPath: `/supplier/issues/${issueId}` }, client);
    if (issue.reported_by !== issue.remedy_supplier_id) await notifyUser(issue.reported_by, { ...msg, linkPath: `/${reporterRole === "supplier" ? "supplier" : "staff"}/issues/${issueId}` }, client);
    return { ok: true, number: issue.issue_number };
  });
}
