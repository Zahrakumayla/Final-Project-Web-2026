import { PageHeader } from "@/components/ui/page-header";
import { RestockForm } from "@/features/restock/restock-form";
import { requirePermission } from "@/lib/auth/guards";
import { todayString } from "@/lib/format";
import { listActiveProducts } from "@/services/products";
import { listApprovedSuppliers } from "@/services/suppliers";

export default async function NewRestockPage({ searchParams }) {
  await requirePermission("RESTOCK_CREATE");
  const { productId } = (await searchParams) ?? {};
  const [suppliers, products] = await Promise.all([listApprovedSuppliers(), listActiveProducts()]);
  return (
    <>
      <PageHeader title="Buat Restock Order" description="Pilih supplier, lalu produk dan jumlah yang dipesan." />
      <div className="max-w-3xl">
        <RestockForm suppliers={suppliers} products={products} presetProduct={productId} minDate={todayString()} />
      </div>
    </>
  );
}
