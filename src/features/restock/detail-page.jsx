import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmRestockAction, deleteRestockAction, rejectRestockAction } from "@/actions/restock";
import { markArrivedAction, shipPurchaseOrderAction } from "@/actions/shipments";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info, Notice, Photo, Steps, Timeline } from "@/components/ui/detail";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { ApprovalBadge, ClaimBadge, InspectionBadge, LateBadge, RestockBadge, ShipmentBadge } from "@/components/ui/status-badges";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { CLAIM_TYPE_LABEL } from "@/lib/labels";
import { markEntityRead } from "@/services/notifications";
import { getRestock } from "@/services/restock";

const STEPS = ["Pending", "Confirmed", "In Transit", "Arrived", "Received"];

export default async function RestockDetailPage({ params }) {
  const user = await requirePermission("RESTOCK_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const order = await getRestock(user, id);
  if (!order) notFound();
  await markEntityRead(user.id, { entityType: "restock_order", entityId: id });

  const home = getHomePath(user.role);
  const isManager = can(user, "RESTOCK_CREATE");
  const monitor = isManager || user.role === "admin";
  const isSupplier = can(user, "RESTOCK_RESPOND");
  const poShipment = order.shipments.find((s) => s.kind === "PO");
  const canShip = isSupplier && order.status === "Confirmed" && !poShipment;
  const steps = order.stage === "Partially Received" ? [...STEPS.slice(0, -1), "Partially Received"] : STEPS;
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const events = [
    { at: order.created_at, title: "PO dibuat (Pending)", by: order.creator_name, note: order.notes },
    ...order.activity.map((a) => ({ at: a.created_at, title: a.activity, note: a.description, by: a.full_name })),
  ];

  return (
    <>
      <PageHeader
        title={order.po_number}
        description={monitor ? order.supplier_company : `Dari ${order.creator_name ?? "gudang"} · ${formatDate(order.order_date)}`}
        actions={
          <>
            <ButtonLink href={`${home}/restock`} variant="outline">Kembali</ButtonLink>
            {can(user, "RESTOCK_DELETE") && order.status === "Pending" && (
              <ActionDialog triggerLabel="Hapus PO" triggerVariant="danger" triggerSize="md" title="Hapus PO ini?" description="PO yang masih Pending (belum direspons supplier) akan dihapus permanen dan supplier diberi tahu. Tindakan ini tidak dapat dibatalkan." action={deleteRestockAction} fields={{ restockId: order.id }} confirmLabel="Ya, hapus PO" confirmVariant="danger" />
            )}
            {isSupplier && order.status === "Pending" && (
              <>
                <ActionDialog triggerLabel="Konfirmasi Pesanan" triggerVariant="primary" triggerSize="md" title="Konfirmasi pesanan ini?" description="Anda menyatakan sanggup memenuhi pesanan dan mulai menyiapkan barang. Stok gudang belum berubah." action={confirmRestockAction} fields={{ restockId: order.id }} confirmLabel="Konfirmasi Pesanan" />
                <ActionDialog triggerLabel="Tolak" triggerVariant="danger" triggerSize="md" title="Tolak pesanan ini?" description="PO berhenti dan tidak bisa dikirim. Alasan dikirim ke Manajer Gudang." action={rejectRestockAction} fields={{ restockId: order.id }} reason={{ label: "Alasan penolakan", required: true, placeholder: "Contoh: stok bahan baku sedang kosong" }} confirmLabel="Tolak pesanan" confirmVariant="danger" />
              </>
            )}
            {canShip && (
              <ActionDialog triggerLabel="Kirim Barang ke Gudang" triggerVariant="primary" triggerSize="md" title="Barang sudah meninggalkan lokasi Anda?" description="Tekan hanya saat barang benar-benar dikirim. Sistem mencatat waktu kirim dan status menjadi In Transit." action={shipPurchaseOrderAction} fields={{ restockId: order.id }} confirmLabel="Ya, kirim sekarang">
                <div className="mt-4 grid gap-3">
                  <FormField id="ship-courier" label="Kurir / ekspedisi (opsional)"><Input id="ship-courier" name="courierName" /></FormField>
                  <FormField id="ship-tracking" label="Nomor resi (opsional)"><Input id="ship-tracking" name="trackingNumber" /></FormField>
                  <FormField id="ship-notes" label="Catatan (opsional)"><Textarea id="ship-notes" name="notes" className="min-h-16" /></FormField>
                </div>
              </ActionDialog>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <Steps steps={steps} current={order.status === "Rejected" ? "Pending" : order.stage} failed={order.status === "Rejected"} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ringkasan" action={<div className="flex gap-1.5"><RestockBadge status={order.stage} />{order.is_late && <LateBadge />}</div>} />
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="Supplier">{order.supplier_company}</Info>
              <Info label="Tanggal pemesanan">{formatDate(order.order_date)}</Info>
              <Info label="Estimasi tiba">{formatDate(order.expected_delivery_date)}</Info>
              <Info label="Total">{order.items.length} produk / {formatNumber(total)} unit</Info>
              <Info label="Total harga">{formatRupiah(order.total_amount)}</Info>
              <Info label="Penerimaan">{order.receipt_status ?? "Belum diterima"}</Info>
            </dl>
            {order.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan: {order.notes}</p>}
            {order.status === "Rejected" && <div className="mt-4"><Notice tone="danger" title="PO ditolak supplier">{order.status_reason}</Notice></div>}
          </Card>

          <div>
            <h2 className="mb-3 text-base font-semibold">Produk dipesan</h2>
            <TableWrap>
              <Table>
                <thead><tr><Th>Produk</Th><Th className="text-right">Jumlah</Th><Th className="text-right">Harga satuan</Th><Th className="text-right">Subtotal</Th><Th className="text-right">Diterima baik</Th></tr></thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <Td><div className="flex items-center gap-3"><ProductImage src={item.image_url} alt="" className="size-10" /><span><span className="block font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.sku}</span></span></div></Td>
                      <Td className="whitespace-nowrap text-right">{formatNumber(item.quantity)} {item.unit}</Td>
                      <Td className="whitespace-nowrap text-right">{formatRupiah(item.unit_price)}</Td>
                      <Td className="whitespace-nowrap text-right font-medium">{formatRupiah(item.subtotal)}</Td>
                      <Td className={`whitespace-nowrap text-right ${item.good_received >= item.quantity ? "text-success" : ""}`}>{formatNumber(item.good_received)}</Td>
                    </tr>
                  ))}
                  <tr><Td className="font-semibold" colSpan={3}>Total</Td><Td className="text-right font-semibold">{formatRupiah(order.total_amount)}</Td><Td /></tr>
                </tbody>
              </Table>
            </TableWrap>
          </div>

          <Card>
            <CardHeader title="Pengiriman & pemeriksaan" />
            {order.shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{order.status === "Confirmed" ? "Barang belum dikirim supplier." : "Belum ada pengiriman."}</p>
            ) : (
              <ul className="divide-y divide-border">
                {order.shipments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="font-semibold">
                        {monitor ? <Link href={`${home}/shipments/${s.id}`} className="hover:underline">{s.shipment_number}</Link> : s.shipment_number}
                        <span className="ml-2 font-normal text-muted-foreground">{s.kind === "PO" ? "Pengiriman pesanan" : `Barang pengganti ${s.claim_number}`}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5"><ShipmentBadge status={s.status} />{s.inspection_status && <InspectionBadge status={s.inspection_status} />}{s.approval_status && <ApprovalBadge status={s.approval_status} />}</div>
                      <p className="text-muted-foreground">Dikirim {formatDateTime(s.shipped_at)}{s.courier_name ? ` · ${s.courier_name}` : ""}{s.tracking_number ? ` · Resi ${s.tracking_number}` : ""}</p>
                      {s.arrived_at && <p className="text-muted-foreground">Tiba {formatDateTime(s.arrived_at)}</p>}
                      {s.inspector_name && <p className="text-muted-foreground">Pemeriksa: {s.inspector_name} ({s.inspection_number})</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Photo src={s.arrival_photo_url} label="Foto tiba" />
                      {isSupplier && s.status === "In Transit" && (
                        <ActionDialog triggerLabel="Unggah Foto Barang Tiba" triggerVariant="primary" title="Barang sudah tiba di gudang?" description="Unggah foto bukti kedatangan (JPG atau PNG, maks 2 MB). Status menjadi Arrived dan Manager diberi tahu." action={markArrivedAction} fields={{ shipmentId: s.id }} confirmLabel="Kirim bukti">
                          <div className="mt-4"><ImagePicker name="photo" label="Foto bukti barang tiba" /></div>
                        </ActionDialog>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {order.claims.length > 0 && (
            <Card>
              <CardHeader title="Klaim barang bermasalah" />
              <ul className="divide-y divide-border text-sm">
                {order.claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`${home}/claims/${c.id}`} className="font-medium hover:underline">{c.claim_number}</Link>
                    <span className="text-muted-foreground">{CLAIM_TYPE_LABEL[c.claim_type]} · {c.product_name} · {c.quantity} unit</span>
                    <ClaimBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Timeline title="Linimasa PO" events={events} />
        </div>
      </div>
    </>
  );
}
