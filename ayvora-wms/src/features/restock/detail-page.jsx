import { notFound } from "next/navigation";
import { advanceRestockAction, confirmRestockAction, rejectRestockAction } from "@/actions/restock";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { LateBadge, RestockBadge, TransactionBadge } from "@/components/ui/status-badges";
import { DeliveryForm, RatingForm } from "@/features/restock/forms";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { getRestock } from "@/services/restock";

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "-"}</dd>
    </div>
  );
}

// Linimasa: PO dibuat + semua aktivitas + perubahan estimasi, urut waktu.
function buildTimeline(order) {
  const events = [{ at: order.created_at, title: "PO dibuat", by: order.creator_name, note: order.notes }];
  for (const item of order.activity) events.push({ at: item.created_at, title: item.activity, by: item.full_name, note: item.description });
  for (const eta of order.etaUpdates) {
    events.push({ at: eta.created_at, title: `Estimasi diubah ${formatDate(eta.old_expected_date)} → ${formatDate(eta.new_expected_date)}`, by: eta.full_name, note: eta.notes });
  }
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

export default async function RestockDetailPage({ params }) {
  const user = await requirePermission("RESTOCK_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const order = await getRestock(user, id);
  if (!order) notFound();

  const home = getHomePath(user.role);
  const isManager = can(user, "RESTOCK_UPDATE_STATUS");
  const isSupplier = can(user, "RESTOCK_RESPOND");
  const canEditDelivery = ["Confirmed", "In Transit"].includes(order.status);
  const next = { Confirmed: "In Transit", "In Transit": "Received" }[order.status];
  const timeline = buildTimeline(order);
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <PageHeader
        title={order.po_number}
        description={isManager ? order.supplier_company : `Dari ${order.creator_name ?? "gudang"}`}
        actions={
          <>
            <ButtonLink href={`${home}/${isManager ? "restock" : "restock"}`} variant="outline">Kembali</ButtonLink>
            {isSupplier && order.status === "Pending" && (
              <>
                <ActionDialog triggerLabel="Konfirmasi" triggerVariant="primary" triggerSize="md" title="Konfirmasi pesanan ini?" description="Anda menyatakan sanggup memenuhi pesanan sesuai jumlah dan estimasi." action={confirmRestockAction} fields={{ restockId: order.id }} confirmLabel="Konfirmasi" />
                <ActionDialog triggerLabel="Tolak" triggerVariant="danger" triggerSize="md" title="Tolak pesanan ini?" description="Alasan akan dikirim ke Warehouse Manager." action={rejectRestockAction} fields={{ restockId: order.id }} reason={{ label: "Alasan penolakan", required: true, placeholder: "Contoh: stok bahan baku sedang kosong" }} confirmLabel="Tolak pesanan" confirmVariant="danger" />
              </>
            )}
            {isManager && next && (
              <ActionDialog triggerLabel={`Tandai ${next}`} triggerVariant="primary" triggerSize="md" title={`Ubah status menjadi ${next}?`} description={next === "Received" ? "Pastikan barang sudah tiba di gudang. Staff akan diminta mencatat barang masuk." : "Barang sudah dikirim oleh supplier."} action={advanceRestockAction} fields={{ restockId: order.id, target: next }} confirmLabel="Ya, ubah" />
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ringkasan" action={<div className="flex gap-1.5"><RestockBadge status={order.status} />{order.is_late && <LateBadge />}</div>} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Supplier">{order.supplier_company}</Info>
              <Info label="Tanggal order">{formatDate(order.order_date)}</Info>
              <Info label="Estimasi tiba">{formatDate(order.expected_delivery_date)}</Info>
              <Info label="Estimasi awal">{formatDate(order.original_expected_delivery_date)}</Info>
              <Info label="Kurir">{order.courier_name}</Info>
              <Info label="No. resi">{order.tracking_number}</Info>
              <Info label="Tanggal kirim">{order.shipped_date ? formatDate(order.shipped_date) : null}</Info>
              <Info label="Total">{order.items.length} produk / {formatNumber(total)} unit</Info>
            </dl>
            {order.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan: {order.notes}</p>}
            {order.status === "Rejected" && order.status_reason && <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-destructive">Alasan penolakan: {order.status_reason}</p>}
            {order.rating && <p className="mt-4 rounded-xl bg-muted p-3 text-sm">Rating: {"★".repeat(order.rating)}{"☆".repeat(5 - order.rating)} {order.feedback && `- ${order.feedback}`}</p>}
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5"><CardHeader title="Produk dipesan" /></div>
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <ProductImage src={item.image_url} alt="" className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatNumber(item.quantity)} {item.unit}</p>
                </li>
              ))}
            </ul>
          </Card>

          {canEditDelivery && (isManager || isSupplier) && <DeliveryForm order={order} />}
          {isManager && order.status === "Received" && !order.rating && <RatingForm orderId={order.id} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Linimasa" />
            <ol className="space-y-4 border-l border-border pl-4">
              {timeline.map((event, index) => (
                <li key={index} className="relative">
                  <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-primary" />
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.note && <p className="text-sm text-muted-foreground">{event.note}</p>}
                  <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}{event.by ? ` · ${event.by}` : ""}</p>
                </li>
              ))}
            </ol>
          </Card>
          {order.transactions.length > 0 && (
            <Card>
              <CardHeader title="Barang masuk terkait" />
              <ul className="space-y-2 text-sm">
                {order.transactions.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-2"><span className="font-medium">{tx.transaction_number}</span><TransactionBadge status={tx.status} /></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
