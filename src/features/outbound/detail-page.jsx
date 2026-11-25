import { notFound } from "next/navigation";
import { cancelOutboundAction, deleteOutboundAction, rejectOutboundAction, startPreparingAction } from "@/actions/outbound";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info, Notice, Steps } from "@/components/ui/detail";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { OutboundBadge } from "@/components/ui/status-badges";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { ApproveForm, ShipForm } from "@/features/outbound/decision-forms";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { getOutbound } from "@/services/outbound";
import { markEntityRead } from "@/services/notifications";
import { statusLabel } from "@/lib/labels";

const STEPS = ["Pending Approval", "Approved", "Preparing", "Shipped"];

export default async function OutboundDetailPage({ params }) {
  const user = await requirePermission("OUTBOUND_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const order = await getOutbound(id);
  if (!order) notFound();
  await markEntityRead(user.id, { entityType: "outbound_order", entityId: id });

  const home = getHomePath(user.role);
  const isManager = can(user, "OUTBOUND_DECIDE");
  const isStaff = can(user, "OUTBOUND_CREATE");
  const showApproved = order.items.some((i) => i.approved_qty !== null);
  const showShipped = order.items.some((i) => i.shipped_qty !== null);
  const stepCurrent = order.status === "Rejected" ? "Pending Approval" : order.status === "Cancelled" ? null : order.status;

  return (
    <>
      <PageHeader
        title={order.order_number}
        description={`Barang keluar untuk ${order.customer_name}`}
        actions={
          <>
            <ButtonLink href={`${home}/outgoing`} variant="outline">Kembali</ButtonLink>
            {isStaff && ["Pending Approval", "Rejected"].includes(order.status) && (
              <ButtonLink href={`${home}/outgoing/${order.id}/edit`} variant={order.status === "Rejected" ? "primary" : "secondary"}>{order.status === "Rejected" ? "Perbaiki & Ajukan Ulang" : "Ubah"}</ButtonLink>
            )}
            {isStaff && order.status === "Pending Approval" && order.created_by === user.id && (
              <ActionDialog triggerLabel="Hapus" triggerVariant="danger" triggerSize="md" title="Hapus laporan ini?" description="Laporan Pending Approval buatan Anda akan dihapus permanen. Hanya bisa dilakukan sebelum Manager memutuskan." action={deleteOutboundAction} fields={{ orderId: order.id }} confirmLabel="Ya, hapus" confirmVariant="danger" />
            )}
            {isStaff && order.status === "Approved" && (
              <ActionDialog triggerLabel="Mulai Siapkan Barang" triggerVariant="primary" triggerSize="md" title="Mulai menyiapkan barang?" description="Ambil produk, cocokkan, pastikan jumlah & kondisi, lalu kemas. Alokasi tetap aktif dan stok fisik belum berubah." action={startPreparingAction} fields={{ orderId: order.id }} confirmLabel="Mulai siapkan" />
            )}
            {isManager && order.status === "Pending Approval" && (
              <ActionDialog triggerLabel="Tolak" triggerVariant="danger" triggerSize="md" title="Tolak laporan barang keluar?" description="Staff akan memperbaiki dan mengajukan ulang. Riwayat penolakan tersimpan." action={rejectOutboundAction} fields={{ orderId: order.id }} reason={{ label: "Alasan penolakan", required: true, placeholder: "Contoh: alamat tujuan belum lengkap" }} confirmLabel="Tolak" confirmVariant="danger" />
            )}
            {isManager && ["Approved", "Preparing"].includes(order.status) && (
              <ActionDialog triggerLabel="Batalkan" triggerVariant="outline" triggerSize="md" title="Batalkan barang keluar?" description="Alokasi stok dilepas. Stok fisik tidak berubah." action={cancelOutboundAction} fields={{ orderId: order.id }} reason={{ label: "Alasan pembatalan", required: true, placeholder: "Contoh: pelanggan membatalkan pesanan" }} confirmLabel="Batalkan" confirmVariant="danger" />
            )}
          </>
        }
      />

      <Card className="mb-6">
        {order.status === "Cancelled" ? <p className="text-sm font-medium text-muted-foreground">Dibatalkan: alur dihentikan, alokasi dilepas.</p> : <Steps steps={STEPS} current={stepCurrent} failed={order.status === "Rejected"} />}
      </Card>

      <div className="mb-6 space-y-3">
        {order.status === "Rejected" && <Notice tone="danger" title="Ditolak Manager">{order.rejection_reason}{isStaff ? " Perbaiki laporan lalu ajukan ulang." : ""}</Notice>}
        {order.status === "Cancelled" && <Notice tone="info" title="Dibatalkan">{order.cancel_reason}</Notice>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Pelanggan & tujuan" action={<OutboundBadge status={order.status} />} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Pelanggan / perusahaan">{order.customer_name}</Info>
              <Info label="Nomor kontak">{order.contact_phone}</Info>
              <Info label="Alamat tujuan" className="sm:col-span-2">{order.destination_address}</Info>
              <Info label="Dibuat oleh">{order.created_by_name} · {formatDateTime(order.created_at)}</Info>
              <Info label="Pengajuan">ke-{order.submission_count}</Info>
              <Info label="Disetujui">{order.decided_at ? `${formatDateTime(order.decided_at)}${order.decided_by_name ? ` · ${order.decided_by_name}` : ""}` : "Belum"}</Info>
              <Info label="Mulai disiapkan">{order.prepared_at ? `${formatDateTime(order.prepared_at)}${order.prepared_by_name ? ` · ${order.prepared_by_name}` : ""}` : "Belum"}</Info>
              <Info label="Tanggal dikirim">{order.shipped_at ? `${formatDateTime(order.shipped_at)}${order.shipped_by_name ? ` · ${order.shipped_by_name}` : ""}` : "Belum dikirim"}</Info>
            </dl>
            {order.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan Staff: {order.notes}</p>}
          </Card>

          <div>
            <h2 className="mb-3 text-base font-semibold">Produk</h2>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Produk</Th><Th className="text-right">Diminta</Th>
                    {order.status === "Pending Approval" && <Th className="text-right">Stok tersedia</Th>}
                    {showApproved && <Th className="text-right">Disetujui</Th>}
                    {showShipped && <Th>Rak</Th>}
                    {showShipped && <Th className="text-right">Dikirim</Th>}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <Td><div className="flex items-center gap-3"><ProductImage src={item.image_url} alt="" className="size-10" /><span><span className="block font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.sku}</span></span></div></Td>
                      <Td className="whitespace-nowrap text-right">{formatNumber(item.requested_qty)} {item.unit}</Td>
                      {order.status === "Pending Approval" && <Td className={`text-right ${item.available_stock < item.requested_qty ? "font-semibold text-warning" : ""}`}>{formatNumber(item.available_stock)}</Td>}
                      {showApproved && <Td className="text-right font-semibold">{item.approved_qty === null ? "-" : formatNumber(item.approved_qty)}</Td>}
                      {showShipped && <Td>{item.rack_code ?? "-"}</Td>}
                      {showShipped && <Td className="text-right">{item.shipped_qty === null ? "-" : formatNumber(item.shipped_qty)}</Td>}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>

          {isManager && order.status === "Pending Approval" && <ApproveForm order={order} />}
          {isStaff && order.status === "Preparing" && <ShipForm order={order} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Riwayat" />
            <ol className="space-y-4 border-l border-border pl-4">
              {order.events.map((event) => (
                <li key={event.seq} className="relative">
                  <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium">#{event.seq} · {statusLabel(event.status)}</p>
                  <p className="text-sm text-muted-foreground">{event.note}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}{event.full_name ? ` · ${event.full_name}` : ""}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
