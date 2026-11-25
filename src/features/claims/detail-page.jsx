import Link from "next/link";
import { notFound } from "next/navigation";
import { refundInvalidAction, refundValidAction, requestResolutionAction, sendReplacementAction, submitRefundAction } from "@/actions/claims";
import { markArrivedAction } from "@/actions/shipments";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info, Notice, Photo, Timeline } from "@/components/ui/detail";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalBadge, ClaimBadge, InspectionBadge, ShipmentBadge } from "@/components/ui/status-badges";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { CLAIM_REPLACEMENT_LABEL, CLAIM_REQUEST_LABEL, CLAIM_TYPE_LABEL, statusLabel } from "@/lib/labels";
import { can, getHomePath } from "@/lib/permissions";
import { getClaim } from "@/services/claims";
import { markEntityRead } from "@/services/notifications";

function RefundFields({ claim, suggested }) {
  return (
    <div className="mt-4 grid gap-3">
      <FormField id="refund-amount" label="Nominal refund (Rp)" required hint={suggested ? `Perkiraan: ${claim.remaining_quantity} x ${formatRupiah(claim.unit_price)} = ${formatRupiah(suggested)}` : undefined}>
        <Input id="refund-amount" name="amount" inputMode="numeric" defaultValue={claim.refund_amount ? Math.round(claim.refund_amount) : suggested ? Math.round(suggested) : ""} />
      </FormField>
      <FormField id="refund-ref" label="Nomor referensi transfer" required>
        <Input id="refund-ref" name="reference" defaultValue={claim.refund_reference ?? ""} />
      </FormField>
      <ImagePicker name="proof" label="Bukti refund (wajib)" />
    </div>
  );
}

// Foto bukti bisa datang sebagai array atau teks "{a,b}" tergantung driver; keduanya diterima.
function photosOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.replace(/[{}"]/g, "").split(",").filter(Boolean);
  return [];
}

export default async function ClaimDetailPage({ params }) {
  const user = await requirePermission("CLAIM_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const claim = await getClaim(user, id);
  if (!claim) notFound();
  await markEntityRead(user.id, { entityType: "claim", entityId: id });

  const home = getHomePath(user.role);
  const isSupplier = can(user, "CLAIM_RESPOND");
  const isManager = can(user, "CLAIM_DECIDE");
  const monitor = isManager || user.role === "admin";
  const open = claim.status === "Claim Submitted";
  const requested = claim.requested_resolution; // pilihan Manager: Replacement | Refund
  const requestedLabel = requested === "Refund" ? "refund" : "barang pengganti";
  const suggested = claim.unit_price ? claim.remaining_quantity * claim.unit_price : null;
  const transitShipment = claim.shipments.find((s) => s.status === "In Transit");

  const events = [
    { at: claim.created_at, title: "Klaim dibuat sistem (Claim Submitted)", note: `Dari pemeriksaan ${claim.inspection_number}` },
    ...claim.activity.map((a) => ({ at: a.created_at, title: a.activity, note: a.description, by: a.full_name })),
  ];

  return (
    <>
      <PageHeader
        title={claim.claim_number}
        description={`${CLAIM_TYPE_LABEL[claim.claim_type]} · ${claim.po_number}${monitor ? ` · ${claim.supplier_company}` : ""}`}
        actions={
          <>
            <ButtonLink href={`${home}/claims`} variant="outline">Kembali</ButtonLink>
            {isSupplier && open && (
              <>
                {requested === "Replacement" && <ActionDialog triggerLabel={CLAIM_REPLACEMENT_LABEL[claim.claim_type]} triggerVariant="primary" triggerSize="md" title={`${CLAIM_REPLACEMENT_LABEL[claim.claim_type]} (${claim.remaining_quantity} unit)`} description="Membuat pengiriman pengganti yang terhubung ke PO dan klaim ini (bukan PO baru). Tekan saat barang benar-benar dikirim." action={sendReplacementAction} fields={{ claimId: claim.id }} confirmLabel="Kirim sekarang">
                  <div className="mt-4 grid gap-3">
                    <FormField id="rep-courier" label="Kurir / ekspedisi (opsional)"><Input id="rep-courier" name="courierName" /></FormField>
                    <FormField id="rep-tracking" label="Nomor resi (opsional)"><Input id="rep-tracking" name="trackingNumber" /></FormField>
                    <FormField id="rep-notes" label="Catatan (opsional)"><Textarea id="rep-notes" name="notes" className="min-h-16" /></FormField>
                  </div>
                </ActionDialog>}
                {requested === "Refund" && <ActionDialog triggerLabel="Lakukan Refund" triggerVariant="primary" triggerSize="md" title="Catat refund" description="Unggah bukti transfer. Manager akan memverifikasi. Refund tidak mengubah stok." action={submitRefundAction} fields={{ claimId: claim.id }} confirmLabel="Ajukan refund">
                  <RefundFields claim={claim} suggested={suggested} />
                </ActionDialog>}
              </>
            )}
            {isSupplier && claim.status === "Refund Processing" && claim.refund_proof_invalid && (
              <ActionDialog triggerLabel="Unggah Ulang Bukti" triggerVariant="primary" triggerSize="md" title="Unggah ulang bukti refund" description={`Alasan Manager: ${claim.refund_rejection_reason}`} action={submitRefundAction} fields={{ claimId: claim.id }} confirmLabel="Kirim ulang">
                <RefundFields claim={claim} suggested={suggested} />
              </ActionDialog>
            )}
            {isSupplier && transitShipment && (
              <ActionDialog triggerLabel="Unggah Foto Barang Tiba" triggerVariant="primary" triggerSize="md" title="Barang pengganti sudah tiba?" description="Unggah foto bukti kedatangan. Manager akan memerintahkan pemeriksaan." action={markArrivedAction} fields={{ shipmentId: transitShipment.id }} confirmLabel="Kirim bukti">
                <div className="mt-4"><ImagePicker name="photo" label="Foto bukti barang tiba" /></div>
              </ActionDialog>
            )}
            {isManager && open && (
              <>
                {requested !== "Replacement" && (
                  <ActionDialog triggerLabel={requested ? `Ubah ke ${CLAIM_REQUEST_LABEL[claim.claim_type]}` : CLAIM_REQUEST_LABEL[claim.claim_type]} triggerVariant={requested ? "outline" : "primary"} triggerSize="md" title={`${CLAIM_REQUEST_LABEL[claim.claim_type]} (${claim.remaining_quantity} unit)`} description="Supplier diminta mengirim barang ke gudang lagi untuk transaksi PO yang sama. Barang yang tiba akan diperiksa dan ditinjau Manager untuk kedua kalinya." action={requestResolutionAction} fields={{ claimId: claim.id, resolution: "Replacement" }} reason={{ label: "Catatan untuk supplier (opsional)", placeholder: "Contoh: mohon kirim paling lambat Jumat" }} confirmLabel="Kirim permintaan" />
                )}
                {requested !== "Refund" && (
                  <ActionDialog triggerLabel={requested ? "Ubah ke Refund" : "Minta Refund"} triggerVariant={requested ? "outline" : "secondary"} triggerSize="md" title={`Minta refund (${claim.remaining_quantity} unit)`} description={`Supplier diminta mengembalikan dana${suggested ? ` (perkiraan ${formatRupiah(suggested)})` : ""} dan mengunggah bukti transfer. Anda akan memverifikasi bukti tersebut.`} action={requestResolutionAction} fields={{ claimId: claim.id, resolution: "Refund" }} reason={{ label: "Catatan untuk supplier (opsional)", placeholder: "Contoh: refund ke rekening perusahaan" }} confirmLabel="Kirim permintaan" />
                )}
              </>
            )}
            {isManager && claim.status === "Refund Processing" && !claim.refund_proof_invalid && (
              <>
                <ActionDialog triggerLabel="Bukti Valid" triggerVariant="primary" triggerSize="md" title="Bukti refund valid?" description={`Refund ${formatRupiah(claim.refund_amount)}. Klaim menjadi Resolved. Stok tidak berubah.`} action={refundValidAction} fields={{ claimId: claim.id }} confirmLabel="Ya, valid" />
                <ActionDialog triggerLabel="Bukti Tidak Valid" triggerVariant="danger" triggerSize="md" title="Bukti refund tidak valid?" description="Klaim tetap Refund Processing dan Supplier diminta mengunggah ulang." action={refundInvalidAction} fields={{ claimId: claim.id }} reason={{ label: "Alasan", required: true, placeholder: "Contoh: nominal pada bukti tidak terbaca" }} confirmLabel="Minta unggah ulang" confirmVariant="danger" />
              </>
            )}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {open && requested && <Notice tone="info" title={`Manager meminta ${requestedLabel}`}>{isSupplier ? `Mohon ${requested === "Refund" ? "lakukan refund" : "kirim barang pengganti"} untuk ${claim.remaining_quantity} unit.` : `Menunggu supplier ${requested === "Refund" ? "melakukan refund dan mengunggah bukti" : "mengirim barang pengganti"} untuk ${claim.remaining_quantity} unit.`}{claim.request_note ? ` Catatan: ${claim.request_note}` : ""}</Notice>}
        {claim.status === "Refund Processing" && claim.refund_proof_invalid && <Notice tone="danger" title="Bukti refund tidak valid">{claim.refund_rejection_reason}. Menunggu Supplier mengunggah ulang.</Notice>}
        {["Resolved", "Claim Rejected"].includes(claim.status) && <Notice tone={claim.status === "Resolved" ? "success" : "info"} title={statusLabel(claim.status)}>{claim.resolution_note} {claim.resolved_by_name ? `(${claim.resolved_by_name}, ${formatDateTime(claim.resolved_at)})` : ""}</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Detail klaim" action={<ClaimBadge status={claim.status} />} />
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="No. PO">{monitor ? <Link href={`${home}/restock/${claim.restock_order_id}`} className="text-primary hover:underline">{claim.po_number}</Link> : <Link href={`/supplier/restock/${claim.restock_order_id}`} className="text-primary hover:underline">{claim.po_number}</Link>}</Info>
              <Info label="Pemeriksaan">{monitor ? <Link href={`${home}/inspections/${claim.inspection_id}`} className="text-primary hover:underline">{claim.inspection_number}</Link> : claim.inspection_number}</Info>
              <Info label="Jenis masalah">{CLAIM_TYPE_LABEL[claim.claim_type]}</Info>
              <Info label="Produk">{claim.product_name} ({claim.sku})</Info>
              <Info label="Jumlah">{formatNumber(claim.quantity)} {claim.unit}</Info>
              <Info label="Sisa belum selesai">{formatNumber(claim.remaining_quantity)} {claim.unit}</Info>
              {claim.claim_type === "Wrong Item" && <Info label="Produk yang datang" className="sm:col-span-3">{claim.actual_product_name ? `${claim.actual_product_name} (${claim.actual_sku})` : claim.actual_description}</Info>}
            </dl>
            <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-border pt-4">
              <div className="min-w-0 flex-1 text-sm"><p className="text-xs text-muted-foreground">Catatan Staff</p><p className="mt-0.5">{claim.staff_note ?? "-"}</p></div>
              <Photo src={claim.photo_url} label="Foto Staff" />
            </div>
          </Card>

          {requested && (
            <Card>
              <CardHeader title="Permintaan Manager" />
              <dl className="grid gap-4 sm:grid-cols-3">
                <Info label="Penyelesaian">{requested === "Refund" ? "Refund" : CLAIM_REPLACEMENT_LABEL[claim.claim_type]}</Info>
                <Info label="Diminta oleh">{claim.requested_by_name ?? "-"}</Info>
                <Info label="Waktu">{formatDateTime(claim.requested_at)}</Info>
                {claim.request_note && <Info label="Catatan" className="sm:col-span-3">{claim.request_note}</Info>}
              </dl>
            </Card>
          )}

          {claim.refund_amount && (
            <Card>
              <CardHeader title="Refund" />
              {claim.refund_amount && (
                <div className="flex flex-wrap items-start gap-4">
                  <dl className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Info label="Nominal">{formatRupiah(claim.refund_amount)}</Info>
                    <Info label="Referensi">{claim.refund_reference}</Info>
                    <Info label="Diajukan">{formatDateTime(claim.refund_submitted_at)}</Info>
                  </dl>
                  <Photo src={claim.refund_proof_url} label="Bukti refund" />
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Pengiriman barang pengganti" />
            {claim.shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada barang pengganti.</p>
            ) : (
              <ul className="divide-y divide-border">
                {claim.shipments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                    <div className="space-y-1">
                      <p className="font-semibold">{monitor ? <Link href={`${home}/shipments/${s.id}`} className="hover:underline">{s.shipment_number}</Link> : s.shipment_number} <span className="font-normal text-muted-foreground">· {s.quantity} unit</span></p>
                      <div className="flex flex-wrap gap-1.5"><ShipmentBadge status={s.status} /><InspectionBadge status={s.inspection_status} /><ApprovalBadge status={s.approval_status} /></div>
                      <p className="text-muted-foreground">Dikirim {formatDateTime(s.shipped_at)}{s.courier_name ? ` · ${s.courier_name}` : ""}{s.arrived_at ? ` · Tiba ${formatDateTime(s.arrived_at)}` : ""}</p>
                      {s.inspection_number && (
                        <p className="text-muted-foreground">
                          Pemeriksaan {monitor && s.inspection_id ? <Link href={`${home}/inspections/${s.inspection_id}`} className="text-primary hover:underline">{s.inspection_number}</Link> : s.inspection_number}
                          {s.approval_status === "Approved" ? " (disetujui Manager)" : s.approval_status === "Awaiting Approval" ? " (menunggu tinjauan Manager)" : ""}
                        </p>
                      )}
                      {(s.approval_status === "Awaiting Approval" || s.approval_status === "Approved") && (
                        <p>
                          <span className="text-success">Baik {s.good_qty ?? 0}</span>
                          {" · "}<span className={s.damaged_qty > 0 ? "text-destructive" : "text-muted-foreground"}>Rusak {s.damaged_qty ?? 0}</span>
                          {" · "}<span className={s.shortage_qty > 0 ? "text-destructive" : "text-muted-foreground"}>Kurang {s.shortage_qty ?? 0}</span>
                        </p>
                      )}
                      {s.approval_status === "Approved" && (s.damaged_qty > 0 || s.shortage_qty > 0) && <p className="text-destructive">Masih tidak sesuai. Sisa klaim menunggu keputusan Manager.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Photo src={s.arrival_photo_url} label="Foto tiba" />
                      {photosOf(s.evidence_photos).map((url) => <Photo key={url} src={url} label="Bukti pemeriksaan" />)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Timeline title="Riwayat klaim" events={events} />
        </div>
      </div>
    </>
  );
}
