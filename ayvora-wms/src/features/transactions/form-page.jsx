import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { TransactionForm } from "@/features/transactions/transaction-form";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { todayString } from "@/lib/format";
import { getTransaction, listProductRacks, listReceivablePurchaseOrders } from "@/services/transactions";
import { listApprovedSuppliers } from "@/services/suppliers";

function groupProducts(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.product_id)) map.set(row.product_id, { productId: row.product_id, name: row.name, sku: row.sku, unit: row.unit, racks: [] });
    map.get(row.product_id).racks.push({ rackId: row.rack_id, rackCode: row.rack_code, quantity: row.quantity });
  }
  return [...map.values()];
}

// type: INCOMING | OUTGOING. Dipakai untuk halaman baru dan ubah.
export async function TransactionFormPage({ type, params, searchParams }) {
  const user = await requirePermission("TRANSACTION_CREATE");
  const { id } = (await params) ?? {};
  let transaction = null;
  if (id) {
    if (!isUuid(id)) notFound();
    transaction = await getTransaction(user, id);
    if (!transaction || transaction.type !== type || transaction.created_by !== user.id) notFound();
    if (transaction.status !== "Pending") notFound();
  }
  const base = `/staff/${type === "INCOMING" ? "incoming" : "outgoing"}`;
  const [racks, suppliers, pos] = await Promise.all([
    listProductRacks(),
    type === "INCOMING" ? listApprovedSuppliers() : [],
    type === "INCOMING" && !transaction ? listReceivablePurchaseOrders() : [],
  ]);
  const { po } = (await searchParams) ?? {};
  const title = `${transaction ? "Ubah" : "Catat"} Barang ${type === "INCOMING" ? "Masuk" : "Keluar"}`;

  return (
    <>
      <PageHeader title={title} description="Transaksi baru berstatus Pending sampai disetujui Manager. Stok baru berubah setelah disetujui." />
      <div className="max-w-4xl">
        <TransactionForm type={type} mode={transaction ? "edit" : "create"} transaction={transaction} products={groupProducts(racks)} suppliers={suppliers} purchaseOrders={pos} presetPoId={po} today={todayString()} cancelHref={transaction ? `${base}/${transaction.id}` : base} />
      </div>
    </>
  );
}

