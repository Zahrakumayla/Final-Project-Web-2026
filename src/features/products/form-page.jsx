import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/features/products/product-form";
import { requirePermission } from "@/lib/auth/guards";
import { isUuid } from "@/lib/action-helpers";
import { getHomePath } from "@/lib/permissions";
import { listAllCategories } from "@/services/categories";
import { getProduct, listActiveProducts, listRacks } from "@/services/products";


// Dipakai untuk /products/new dan /products/[id]/edit
export default async function ProductFormPage({ params }) {
  const user = await requirePermission("PRODUCT_MANAGE");
  const base = `${getHomePath(user.role)}/products`;
  const { id } = (await params) ?? {};

  let product = null;
  if (id) {
    if (!isUuid(id)) notFound();
    product = await getProduct(id);
    if (!product) notFound();
  }
  const [categories, racks, existing] = await Promise.all([listAllCategories(), listRacks(), listActiveProducts()]);

  return (
    <>
      <PageHeader title={product ? `Ubah ${product.product_name}` : "Tambah Produk"} />
      <div className="max-w-3xl">
        <ProductForm mode={product ? "edit" : "create"} product={product} categories={categories} racks={racks} existing={existing} cancelHref={product ? `${base}/${product.product_id}` : base} />
      </div>
    </>
  );
}
