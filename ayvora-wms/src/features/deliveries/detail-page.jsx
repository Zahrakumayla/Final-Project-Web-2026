import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DeliveryBadge } from "@/components/ui/status-badges";
import { ShipmentForm } from "@/features/deliveries/shipment-form";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { NEXT_STATUS, getShipment } from "@/services/shipments";

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "-"}</dd>
    </div>
  );
}

export default async function DeliveryDetailPage({ params }) {
  const user = await requirePermission("SHIPMENT_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const shipment = await getShipment(id);
  if (!shipment) notFound();
  const home = getHomePath(user.role);
  const manage = can(user, "SHIPMENT_MANAGE");
  const next = NEXT_STATUS[shipment.delivery_status];

  return (
    <>
      <PageHeader title={`Pengiriman ${shipment.transaction_number}`} description={shipment.customer_name} actions={<ButtonLink href={`${home}/deliveries`} variant="outline">Kembali</ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ringkasan" action={<DeliveryBadge status={shipment.delivery_status} />} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Tujuan">{shipment.customer_name}</Info>
              <Info label="Tanggal transaksi">{formatDate(shipment.transaction_date)}</Info>
              <Info label="Kurir">{shipment.courier_name}</Info>
              <Info label="No. resi">{shipment.tracking_number}</Info>
              <Info label="Tanggal kirim">{shipment.actual_ship_date ? formatDate(shipment.actual_ship_date) : null}</Info>
              <Info label="Estimasi tiba">{shipment.estimated_arrival_date ? formatDate(shipment.estimated_arrival_date) : null}</Info>
            </dl>
            {shipment.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan: {shipment.notes}</p>}
          </Card>
          <Card>
            <CardHeader title="Barang yang dikirim" />
            <ul className="divide-y divide-border text-sm">
              {shipment.items.map((item, index) => (
                <li key={index} className="flex justify-between gap-2 py-2"><span>{item.name} <span className="text-xs text-muted-foreground">({item.sku} · Rak {item.rack_code})</span></span><span className="font-semibold">{formatNumber(item.quantity)} {item.unit}</span></li>
              ))}
            </ul>
          </Card>
          {manage && <ShipmentForm shipment={shipment} nextStatuses={next} />}
        </div>
        <Card className="h-fit">
          <CardHeader title="Riwayat status" />
          <ol className="space-y-4 border-l border-border pl-4">
            {shipment.history.map((event, index) => (
              <li key={index} className="relative">
                <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">{event.status}</p>
                {event.notes && <p className="text-sm text-muted-foreground">{event.notes}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}{event.full_name ? ` · ${event.full_name}` : ""}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
