import Link from "next/link";
import { notFound } from "next/navigation";
import { assignInspectionAction } from "@/actions/shipments";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info, Notice, Photo } from "@/components/ui/detail";
import { FormField, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { ApprovalBadge, InspectionBadge, ShipmentBadge } from "@/components/ui/status-badges";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { can, getHomePath } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { getShipment, listActiveStaff } from "@/services/shipments";
import { markEntityRead } from "@/services/notifications";

function StaffFields({ staff }) {
  return (
    <div className="mt-4 grid gap-3">
      <FormField id="assign-staff" label="Staff pemeriksa" required>
        <Select id="assign-staff" name="staffId" defaultValue="">
          <option value="">Pilih satu Staff</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.open_tasks} tugas aktif)</option>)}
        </Select>
      </FormField>
      <FormField id="assign-instruction" label="Instruksi (opsional)">
        <Textarea id="assign-instruction" name="instruction" className="min-h-16" placeholder="Contoh: periksa sudut kardus, foto bila penyok" />
      </FormField>
    </div>
  );
}

export default async function ShipmentDetailPage({ params }) {
  const user = await requirePermission("INBOUND_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [shipment, staff] = await Promise.all([getShipment(user, id), listActiveStaff()]);
  if (!shipment) notFound();
  const home = getHomePath(user.role);
  await markEntityRead(user.id, { entityType: "inbound_shipment", entityId: id, linkPath: `${getHomePath(user.role)}/shipments/${id}` });

  const active = shipment.inspections.find((i) => i.status !== "Not Found");
  const lastNotFound = shipment.inspections.find((i) => i.status === "Not Found");
  const mayAssign = can(user, "INSPECTION_ASSIGN"); // hanya Manager; Admin hanya memantau
  const canAssign = mayAssign && shipment.status === "Arrived" && !active;
  const canReassign = mayAssign && active && ["Awaiting Inspection", "Under Inspection"].includes(active.status);

  return (
    <>
      <PageHeader
        title={shipment.shipment_number}
        description={`${shipment.kind === "PO" ? "Pengiriman pesanan" : `Barang pengganti untuk ${shipment.claim_number}`} · ${shipment.supplier_company}`}
        actions={
          <>
            <ButtonLink href={`${home}/shipments`} variant="outline">Kembali</ButtonLink>
            {canAssign && (
              <ActionDialog triggerLabel="Perintahkan Pemeriksaan" triggerVariant="primary" triggerSize="md" title="Perintahkan pemeriksaan" description="Tunjuk satu Staff. Hanya Staf ini yang dapat mengisi laporan pemeriksaan." action={assignInspectionAction} fields={{ shipmentId: shipment.id }} confirmLabel="Perintahkan">
                <StaffFields staff={staff} />
              </ActionDialog>
            )}
            {canReassign && (
              <ActionDialog triggerLabel="Ganti Staff" triggerVariant="outline" triggerSize="md" title="Ganti Staff pemeriksa" description={`Saat ini: ${active.inspector_name}. Staff lama akan diberi tahu.`} action={assignInspectionAction} fields={{ shipmentId: shipment.id }} confirmLabel="Ganti">
                <StaffFields staff={staff} />
              </ActionDialog>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {canAssign && lastNotFound && <Notice tone="danger" title={`Pemeriksaan ${lastNotFound.inspection_number}: barang tidak ditemukan`}>{lastNotFound.not_found_note} Tindak lanjuti ke supplier, lalu perintahkan pemeriksaan ulang bila barang sudah ada.</Notice>}

          <Card>
            <CardHeader title="Ringkasan pengiriman" action={<ShipmentBadge status={shipment.status} />} />
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="No. PO"><Link href={`${home}/restock/${shipment.restock_order_id}`} className="text-primary hover:underline">{shipment.po_number}</Link></Info>
              <Info label="Supplier">{shipment.supplier_company}</Info>
              <Info label="Tanggal PO">{formatDate(shipment.order_date)}</Info>
              <Info label="Dikirim">{formatDateTime(shipment.shipped_at)}</Info>
              <Info label="Kurir">{shipment.courier_name}</Info>
              <Info label="No. resi">{shipment.tracking_number}</Info>
              <Info label="Tiba">{shipment.arrived_at ? formatDateTime(shipment.arrived_at) : null}</Info>
              {shipment.kind === "Replacement" && <Info label="Klaim"><Link href={`${home}/claims/${shipment.claim_id}`} className="text-primary hover:underline">{shipment.claim_number}</Link></Info>}
            </dl>
            {shipment.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan supplier: {shipment.notes}</p>}
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5"><CardHeader title="Isi pengiriman" /></div>
            <ul className="divide-y divide-border">
              {shipment.items.map((item) => (
                <li key={item.product_id} className="flex items-center gap-3 px-5 py-3">
                  <ProductImage src={item.image_url} alt="" className="size-12" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.sku}</p></div>
                  <p className="text-sm font-semibold">{formatNumber(item.quantity)} {item.unit}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Foto bukti tiba" />
            {shipment.arrival_photo_url ? <Photo src={shipment.arrival_photo_url} className="[&_img]:size-full [&_img]:max-h-72" label={formatDateTime(shipment.arrived_at)} /> : <p className="text-sm text-muted-foreground">Belum diunggah supplier.</p>}
          </Card>
          <Card>
            <CardHeader title="Pemeriksaan" />
            {shipment.inspections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada pemeriksaan.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {shipment.inspections.map((ins) => (
                  <li key={ins.id} className="rounded-xl border border-border p-3">
                    <Link href={`${home}/inspections/${ins.id}`} className="font-semibold hover:underline">{ins.inspection_number}</Link>
                    <div className="mt-1 flex flex-wrap gap-1.5"><InspectionBadge status={ins.status} /><ApprovalBadge status={ins.approval_status} /></div>
                    <p className="mt-1 text-muted-foreground">{ins.inspector_name} · {formatDateTime(ins.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
