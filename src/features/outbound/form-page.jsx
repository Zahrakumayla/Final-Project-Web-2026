import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { OutboundForm } from "@/features/outbound/outbound-form";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { getOutbound, listProductsForOutbound } from "@/services/outbound";

// Dipakai untuk /staff/outgoing/new dan /staff/outgoing/[id]/edit
export default async function OutboundFormPage({ params }) {
  await requirePermission("OUTBOUND_CREATE");
  const { id } = (await params) ?? {};
  let order = null;
  if (id) {
    if (!isUuid(id)) notFound();
    order = await getOutbound(id);
    if (!order || !["Pending Approval", "Rejected"].includes(order.status)) notFound();
  }
  const products = await listProductsForOutbound();
  return (
    <>
      <PageHeader
        title={order ? (order.status === "Rejected" ? `Perbaiki ${order.order_number}` : `Ubah ${order.order_number}`) : "Buat Laporan Barang Keluar"}
      />
      <div className="max-w-3xl">
        <OutboundForm products={products} order={order} cancelHref={order ? `/staff/outgoing/${order.id}` : "/staff/outgoing"} />
      </div>
    </>
  );
}
