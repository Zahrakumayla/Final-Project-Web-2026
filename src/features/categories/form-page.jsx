import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryForm } from "@/features/categories/category-form";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { getHomePath } from "@/lib/permissions";
import { getCategory } from "@/services/categories";


export default async function CategoryFormPage({ params }) {
  const user = await requirePermission("CATEGORY_MANAGE");
  const { id } = (await params) ?? {};
  let category = null;
  if (id) {
    if (!isUuid(id)) notFound();
    category = await getCategory(id);
    if (!category) notFound();
  }
  return (
    <>
      <PageHeader title={category ? `Ubah ${category.name}` : "Tambah Kategori"} />
      <div className="max-w-2xl">
        <CategoryForm category={category} cancelHref={`${getHomePath(user.role)}/categories`} />
      </div>
    </>
  );
}
