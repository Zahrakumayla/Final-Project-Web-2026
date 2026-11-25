import Link from "next/link";
import { notFound } from "next/navigation";
import { approveInspectionAction, reportNotFoundAction, requestRevisionAction, startInspectionAction } from "@/actions/inspections";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info, Notice, Photo, Steps } from "@/components/ui/detail";
import { requestResolutionAction } from "@/actions/claims";
import { CLAIM_REQUEST_LABEL, CLAIM_TYPE_LABEL } from "@/lib/labels";

import { PageHeader } from "@/components/ui/page-header";
import { ApprovalBadge, ClaimBadge, InspectionBadge } from "@/components/ui/status-badges";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { ApproveInspectionForm } from "@/features/inspections/approve-form";
import { InspectionForm } from "@/features/inspections/inspection-form";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { listActiveProducts, listRacks } from "@/services/products";
import { getInspection } from "@/services/inspections";
import { markEntityRead } from "@/services/notifications";

const STEPS = ["Awaiting Inspection", "Under Inspection", "Inspection Completed", "Awaiting Approval", "Approved"];

// Temuan bermasalah dari laporan Staff (sama dengan klaim yang dibuat database saat disetujui)
function problemsOf(ins) {
  if (ins.kind !== "PO") return [];
  const out = [];
  for (const item of ins.items) {
    const wrong = ins.mismatches.filter((m) => m.expected_product_id === item.product_id).reduce((sum, m) => sum + m.quantity, 0);
    if (item.shortage_qty - wrong > 0) out.push({ key: `Shortage:${item.product_id}`, type: "Shortage", name: item.name, quantity: item.shortage_qty - wrong, note: item.note });
    if (item.damaged_qty > 0) out.push({ key: `Damaged:${item.product_id}`, type: "Damaged", name: item.name, quantity: item.damaged_qty, note: item.note });
  }
  const wrongByProduct = new Map();
  for (const m of ins.mismatches) wrongByProduct.set(m.expected_product_id, (wrongByProduct.get(m.expected_product_id) ?? 0) + m.quantity);
  for (const [productId, quantity] of wrongByProduct) {
    const m = ins.mismatches.find((x) => x.expected_product_id === productId);
    out.push({ key: `Wrong Item:${productId}`, type: "Wrong Item", name: m.expected_name, quantity, note: m.note });
  }
  return out;
}

function stepOf(ins) {
  if (ins.approval_status === "Approved") return "Approved";
  if (ins.approval_status === "Awaiting Approval") return "Awaiting Approval";
  return ins.status;
}

// Hasil pemeriksaan (tampilan baca): dipesan vs diterima, baik, rusak, kurang, produk tidak sesuai
function ResultTables({ ins }) {
  return (
    <>
      <div>
        <h2 className="mb-3 text-base font-semibold">Hasil pemeriksaan</h2>
        <TableWrap>
          <Table>
            <thead><tr><Th>Produk</Th><Th className="text-right">Dipesan</Th><Th className="text-right">Diterima</Th><Th className="text-right">Baik</Th><Th className="text-right">Rusak</Th><Th className="text-right">Kurang</Th><Th>Rak</Th><Th>Catatan & foto</Th></tr></thead>
            <tbody>
              {ins.items.map((item) => (
                <tr key={item.id}>
                  <Td><span className="font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.sku}</span></Td>
                  <Td className="text-right">{formatNumber(item.ordered_qty)}</Td>
                  <Td className="text-right">{formatNumber(item.received_qty)}</Td>
                  <Td className="text-right font-semibold text-success">{formatNumber(item.good_qty)}</Td>
                  <Td className={`text-right ${item.damaged_qty ? "font-semibold text-destructive" : ""}`}>{formatNumber(item.damaged_qty)}</Td>
                  <Td className={`text-right ${item.shortage_qty ? "font-semibold text-warning" : ""}`}>{formatNumber(item.shortage_qty)}</Td>
                  <Td>{item.rack_code ?? "-"}</Td>
                  <Td><div className="flex items-start gap-2">{item.note && <span className="text-sm">{item.note}</span>}<Photo src={item.photo_url} className="[&_img]:size-14" /></div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </div>
      {ins.mismatches.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Barang tidak sesuai pesanan</h2>
          <TableWrap>
            <Table>
              <thead><tr><Th>Seharusnya</Th><Th>Aktual</Th><Th className="text-right">Jumlah</Th><Th>Catatan</Th><Th>Foto</Th></tr></thead>
              <tbody>
                {ins.mismatches.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-medium">{m.expected_name}</Td>
                    <Td>{m.actual_name ? `${m.actual_name} (${m.actual_sku})` : m.actual_description}</Td>
                    <Td className="text-right">{formatNumber(m.quantity)}</Td>
                    <Td>{m.note}</Td>
                    <Td><Photo src={m.photo_url} className="[&_img]:size-14" /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      )}
    </>
  );
}

export default async function InspectionDetailPage({ params }) {
  const user = await requirePermission("INSPECTION_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ins = await getInspection(user, id);
  if (!ins) notFound();
  await markEntityRead(user.id, { entityType: "inspection", entityId: id });

  const home = getHomePath(user.role);
  const isStaff = can(user, "INSPECTION_PERFORM") && ins.assigned_to === user.id;
  const isManager = can(user, "INSPECTION_APPROVE");
  const monitor = isManager || user.role === "admin";
  const editing = isStaff && ins.status === "Under Inspection";
  const [racks, catalog] = editing ? await Promise.all([listRacks(), listActiveProducts()]) : [[], []];
  const goodTotal = ins.items.reduce((sum, item) => sum + item.good_qty, 0);
  const problems = problemsOf(ins);
  const reviewing = isManager && ins.approval_status === "Awaiting Approval";

  return (
    <>
      <PageHeader
        title={ins.inspection_number}
        description={`${ins.kind === "PO" ? "Pemeriksaan barang PO" : `Pemeriksaan barang pengganti ${ins.claim_number}`} · ${ins.po_number}`}
        actions={
          <>
            <ButtonLink href={`${home}/inspections`} variant="outline">Kembali</ButtonLink>
            {isStaff && ins.status === "Awaiting Inspection" && (
              <ActionDialog triggerLabel="Mulai Periksa" triggerVariant="primary" triggerSize="md" title="Mulai memeriksa barang?" description="Status berubah menjadi Under Inspection. Detail PO asli tampil di halaman ini untuk dibandingkan." action={startInspectionAction} fields={{ inspectionId: ins.id }} confirmLabel="Mulai Periksa" />
            )}
            {isStaff && ins.status === "Under Inspection" && !ins.approval_status && (
              <ActionDialog triggerLabel="Lapor Barang Tidak Ditemukan" triggerVariant="danger" triggerSize="md" title="Barang tidak ditemukan?" description="Pemeriksaan dihentikan dan Manager diberi tahu untuk menindaklanjuti ke supplier." action={reportNotFoundAction} fields={{ inspectionId: ins.id }} reason={{ label: "Catatan", required: true, placeholder: "Contoh: tidak ada barang di area bongkar muat" }} confirmLabel="Kirim laporan" confirmVariant="danger" />
            )}
            {isManager && ins.approval_status === "Awaiting Approval" && (
              <>
                {problems.length > 0 ? (
                  <ButtonLink href="#tindakan-klaim">Setujui & Ajukan Klaim</ButtonLink>
                ) : (
                <ActionDialog triggerLabel="Setujui Pemeriksaan" triggerVariant="primary" triggerSize="md" title="Setujui hasil pemeriksaan?" description={`Stok bertambah ${formatNumber(goodTotal)} unit (hanya jumlah baik). Barang kurang, rusak, dan tidak sesuai otomatis menjadi klaim ke supplier. Tindakan ini hanya sekali.`} action={approveInspectionAction} fields={{ inspectionId: ins.id }} confirmLabel="Setujui" />
                )}
                <ActionDialog triggerLabel="Minta Revisi" triggerVariant="outline" triggerSize="md" title="Minta revisi laporan?" description="Laporan dikembalikan ke Staff untuk diperbaiki. Stok tidak berubah." action={requestRevisionAction} fields={{ inspectionId: ins.id }} reason={{ label: "Alasan revisi", required: true, placeholder: "Contoh: foto barang rusak kurang jelas" }} confirmLabel="Kirim revisi" confirmVariant="danger" />
              </>
            )}
          </>
        }
      />

      <Card className="mb-6"><Steps steps={STEPS} current={stepOf(ins)} failed={ins.status === "Not Found"} /></Card>

      <div className="mb-6 space-y-3">
        {ins.instruction && <Notice tone="info" title={`Instruksi dari ${ins.assigned_by_name}`}>{ins.instruction}</Notice>}
        {ins.approval_status === "Revision Requested" && <Notice tone="danger" title="Revisi diminta Manager">{ins.revision_reason}{isStaff ? " Perbaiki hasil di bawah lalu kirim ulang." : ""}</Notice>}
        {ins.status === "Not Found" && <Notice tone="danger" title="Barang tidak ditemukan">{ins.not_found_note} ({formatDateTime(ins.not_found_at)})</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {editing ? (
            <InspectionForm inspectionId={ins.id} expected={ins.expected} current={ins.items} currentMismatches={ins.mismatches} racks={racks} catalog={catalog} notes={ins.notes} />
          ) : ins.items.length > 0 ? (
            <>
              <ResultTables ins={ins} />
              {ins.notes && <Card><p className="text-sm"><span className="font-medium">Catatan umum:</span> {ins.notes}</p></Card>}
            </>
          ) : (
            <Card><p className="text-sm text-muted-foreground">{ins.status === "Awaiting Inspection" ? (isStaff ? "Tekan Mulai Periksa untuk mengisi hasil pemeriksaan." : "Menunggu Staff memulai pemeriksaan.") : "Belum ada hasil pemeriksaan."}</p></Card>
          )}

          {reviewing && problems.length > 0 && <ApproveInspectionForm inspectionId={ins.id} problems={problems} goodTotal={goodTotal} />}

          {ins.claims.length > 0 && (
            <Card>
              <CardHeader title="Klaim ke supplier" />
              <ul className="divide-y divide-border text-sm">
                {ins.claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    {monitor ? <Link href={`${home}/claims/${c.id}`} className="font-medium hover:underline">{c.claim_number}</Link> : <span className="font-medium">{c.claim_number}</span>}
                    <span className="text-muted-foreground">{CLAIM_TYPE_LABEL[c.claim_type]} · {c.product_name} · {c.quantity} unit</span>
                    <ClaimBadge status={c.status} />
                    {isManager && c.status === "Claim Submitted" && can(user, "CLAIM_DECIDE") && (
                      <span className="flex w-full flex-wrap items-center gap-2">
                        {c.requested_resolution && <span className="text-xs text-muted-foreground">Sudah diminta: {c.requested_resolution === "Refund" ? "refund" : "barang pengganti"}.</span>}
                        <ActionDialog triggerLabel={c.requested_resolution === "Replacement" ? "Diminta: pengganti" : CLAIM_REQUEST_LABEL[c.claim_type]} triggerVariant={c.requested_resolution === "Replacement" ? "secondary" : "primary"} title={`${CLAIM_REQUEST_LABEL[c.claim_type]} (${c.remaining_quantity} unit)`} description="Supplier diminta mengirim barang ke gudang lagi untuk PO yang sama. Barang yang tiba diperiksa dan ditinjau Manager lagi." action={requestResolutionAction} fields={{ claimId: c.id, resolution: "Replacement" }} reason={{ label: "Catatan untuk supplier (opsional)", placeholder: "Contoh: mohon kirim paling lambat Jumat" }} confirmLabel="Kirim permintaan" />
                        <ActionDialog triggerLabel={c.requested_resolution === "Refund" ? "Diminta: refund" : "Minta Refund"} triggerVariant={c.requested_resolution === "Refund" ? "secondary" : "outline"} title={`Minta refund (${c.remaining_quantity} unit)`} description="Supplier diminta mengembalikan dana dan mengunggah bukti transfer. Anda memverifikasi bukti tersebut." action={requestResolutionAction} fields={{ claimId: c.id, resolution: "Refund" }} reason={{ label: "Catatan untuk supplier (opsional)", placeholder: "Contoh: refund ke rekening perusahaan" }} confirmLabel="Kirim permintaan" />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" action={<div className="flex flex-wrap gap-1.5"><InspectionBadge status={ins.status} /><ApprovalBadge status={ins.approval_status} /></div>} />
            <dl className="grid gap-3">
              <Info label="Staff ditunjuk">{ins.inspector_name}</Info>
              <Info label="Diperintahkan oleh">{ins.assigned_by_name} · {formatDateTime(ins.created_at)}</Info>
              <Info label="Tanggal barang diterima di gudang">{ins.arrived_at ? formatDateTime(ins.arrived_at) : null}</Info>
              <Info label="Mulai periksa">{ins.started_at ? formatDateTime(ins.started_at) : null}</Info>
              <Info label="Laporan dikirim">{ins.submitted_at ? `${formatDateTime(ins.submitted_at)} (ke-${ins.submission_count})` : null}</Info>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Detail PO asli" />
            <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Info label="No. PO">{monitor ? <Link href={`${home}/restock/${ins.restock_order_id}`} className="text-primary hover:underline">{ins.po_number}</Link> : ins.po_number}</Info>
              <Info label="Supplier">{ins.supplier_company}</Info>
              <Info label="Tanggal pemesanan">{formatDate(ins.order_date)}</Info>
              <Info label="Pengiriman">{ins.shipment_number}{ins.courier_name ? ` · ${ins.courier_name}` : ""}</Info>
            </dl>
            <ul className="divide-y divide-border text-sm">
              {ins.poItems.map((item) => (
                <li key={item.product_id} className="flex justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.sku} · {formatRupiah(item.unit_price)}</span></span>
                  <span className="shrink-0 font-semibold">{formatNumber(item.quantity)} {item.unit}</span>
                </li>
              ))}
            </ul>
            {ins.kind === "Replacement" && <p className="mt-3 text-xs text-muted-foreground">Ini barang pengganti untuk klaim {ins.claim_number}. Jumlah yang diperiksa = sisa klaim.</p>}
            {ins.po_notes && <p className="mt-3 text-xs text-muted-foreground">Catatan PO: {ins.po_notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Foto bukti tiba (Supplier)" />
            <Photo src={ins.arrival_photo_url} className="[&_img]:size-full [&_img]:max-h-64" label={formatDateTime(ins.arrived_at)} />
          </Card>
        </div>
      </div>
    </>
  );
}
