import { notFound } from "next/navigation";
import { approveTransactionAction, deleteTransactionAction, rejectTransactionAction } from "@/actions/transactions";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { TransactionBadge } from "@/components/ui/status-badges";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { getTransaction } from "@/services/transactions";

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "-"}</dd>
    </div>
  );
}

export default async function TransactionDetailPage({ params }) {
  const user = await requirePermission("TRANSACTION_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const tx = await getTransaction(user, id);
  if (!tx) notFound();

  const home = getHomePath(user.role);
  const incoming = tx.type === "INCOMING";
  const isReviewer = can(user, "TRANSACTION_REVIEW");
  const isOwner = tx.created_by === user.id && can(user, "TRANSACTION_CREATE");
  const pending = tx.status === "Pending";
  const listPath = isReviewer ? `${home}/transactions` : `${home}/${incoming ? "incoming" : "outgoing"}`;
  const editBase = `${home}/${incoming ? "incoming" : "outgoing"}/${tx.id}`;

  return (
    <>
      <PageHeader
        title={tx.transaction_number}
        description={incoming ? "Barang masuk" : "Barang keluar"}
        actions={
          <>
            <ButtonLink href={listPath} variant="outline">Kembali</ButtonLink>
            {isOwner && pending && <ButtonLink href={`${editBase}/edit`} variant="secondary">Ubah</ButtonLink>}
            {isOwner && pending && (
              <ActionDialog triggerLabel="Hapus" triggerVariant="danger" triggerSize="md" title="Hapus transaksi ini?" description="Transaksi Pending dihapus permanen. Stok tidak terpengaruh." action={deleteTransactionAction} fields={{ transactionId: tx.id, type: tx.type }} confirmLabel="Hapus" confirmVariant="danger" />
            )}
            {isOwner && tx.status !== "Rejected" && (tx.has_mismatch || tx.total_damaged > 0) && (
              <ButtonLink href={`${home}/issues/new?transactionId=${tx.id}`} variant="outline">Laporkan masalah</ButtonLink>
            )}
            {isReviewer && pending && (
              <>
                <ActionDialog triggerLabel="Setujui" triggerVariant="primary" triggerSize="md" title="Setujui transaksi ini?" description={incoming ? "Stok layak akan bertambah di rak yang dipilih. Barang rusak tidak masuk stok." : "Stok akan berkurang dari rak yang dipilih dan pengiriman dibuat."} action={approveTransactionAction} fields={{ transactionId: tx.id }} confirmLabel="Setujui" />
                <ActionDialog triggerLabel="Tolak" triggerVariant="danger" triggerSize="md" title="Tolak transaksi ini?" description="Stok tidak berubah. Alasan akan dikirim ke Staff." action={rejectTransactionAction} fields={{ transactionId: tx.id }} reason={{ label: "Alasan penolakan", required: true, placeholder: "Contoh: jumlah tidak sesuai dokumen" }} confirmLabel="Tolak" confirmVariant="danger" />
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ringkasan" action={<div className="flex gap-1.5"><TransactionBadge status={tx.status} />{tx.has_mismatch && <Badge tone="warning">Selisih jumlah</Badge>}</div>} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Tanggal transaksi">{formatDate(tx.transaction_date)}</Info>
              <Info label="Dibuat oleh">{tx.created_by_name}</Info>
              {incoming ? <Info label="Supplier">{tx.supplier_company}</Info> : <Info label="Pelanggan / tujuan">{tx.customer_name}</Info>}
              {incoming && <Info label="Nomor PO">{tx.po_number}</Info>}
              <Info label="Dibuat pada">{formatDateTime(tx.created_at)}</Info>
              {tx.reviewed_by_name && <Info label={tx.status === "Rejected" ? "Ditolak oleh" : "Disetujui oleh"}>{tx.reviewed_by_name} ({formatDateTime(tx.reviewed_at)})</Info>}
            </dl>
            {tx.notes && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Catatan: {tx.notes}</p>}
            {tx.status === "Rejected" && <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-destructive">Alasan penolakan: {tx.rejection_reason}</p>}
            {tx.has_mismatch && <p className="mt-4 rounded-xl bg-warning-soft p-3 text-sm text-warning">Jumlah diterima + rusak berbeda dengan jumlah di PO. Laporkan sebagai masalah bila perlu.</p>}
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5"><CardHeader title="Detail produk" /></div>
            <ul className="divide-y divide-border">
              {tx.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <ProductImage src={item.image_url} alt="" className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.sku} · Rak {item.rack_code}{item.item_note ? ` · ${item.item_note}` : ""}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{formatNumber(item.quantity)} {item.unit}</p>
                    {incoming && item.damaged_quantity > 0 && <p className="text-xs text-destructive">{item.damaged_quantity} rusak (tidak masuk stok)</p>}
                    {incoming && item.expected_quantity !== null && <p className="text-xs text-muted-foreground">PO: {formatNumber(item.expected_quantity)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        {tx.shipmentId && (
          <Card className="h-fit">
            <CardHeader title="Pengiriman" />
            <p className="text-sm text-muted-foreground">Transaksi ini memiliki data pengiriman.</p>
            {can(user, "SHIPMENT_VIEW") && <ButtonLink href={`${home}/deliveries/${tx.shipmentId}`} variant="outline" size="sm" className="mt-3">Lihat pengiriman</ButtonLink>}
          </Card>
        )}
      </div>
    </>
  );
}
