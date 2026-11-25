import { deleteCategoryAction } from "@/actions/categories";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ProductImage } from "@/components/ui/product-image";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listCategories } from "@/services/categories";


export default async function CategoryListPage({ searchParams }) {
  const user = await requirePermission("CATEGORY_VIEW");
  const base = `${getHomePath(user.role)}/categories`;
  const { rows, params, info } = await listCategories(await searchParams);
  const lp = linkParams(params);
  const canExport = can(user, "EXPORT_CATEGORIES");
  const canManage = can(user, "CATEGORY_MANAGE");
  const exportHref = `/api/export/categories?${new URLSearchParams(Object.entries(lp).filter(([, v]) => v)).toString()}`;

  return (
    <>
      <PageHeader
        title={canManage ? "Manajemen Kategori" : "Kategori"}
        actions={
          <>
            {canExport && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
            {canManage && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Tambah Kategori</ButtonLink>}
          </>
        }
      />
      <FilterBar basePath={base} params={params} placeholder="Cari kategori" />

      {rows.length === 0 ? (
        <EmptyState icon="tag" title="Kategori tidak ditemukan" description="Coba kata kunci lain atau tambahkan kategori baru." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="Kategori" sortKey="name" basePath={base} params={lp} />
                  <Th>Deskripsi</Th>
                  <SortTh label="Produk aktif" sortKey="products" basePath={base} params={lp} className="text-right" />
                  <Th className="text-right">Stok total</Th>
                  {canManage && <Th className="text-right">Aksi</Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td>
                      <div className="flex items-center gap-3">
                        <ProductImage src={row.image_url} alt="" className="size-11" />
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </Td>
                    <Td className="max-w-sm text-muted-foreground">{row.description ?? "-"}</Td>
                    <Td className="whitespace-nowrap text-right">{row.product_count}</Td>
                    <Td className="whitespace-nowrap text-right">{row.stock_total}</Td>
                    {canManage && <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <ButtonLink href={`${base}/${row.id}/edit`} variant="outline" size="sm">Ubah</ButtonLink>
                        <ActionDialog
                          triggerLabel="Hapus"
                          triggerVariant="outline"
                          title={`Hapus kategori ${row.name}?`}
                          description="Kategori hanya dapat dihapus bila stok semua produknya 0 dan tidak ada produk atau supplier yang masih memakainya."
                          action={deleteCategoryAction}
                          fields={{ categoryId: row.id }}
                          confirmLabel="Hapus"
                          confirmVariant="danger"
                        />
                      </div>
                    </Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={base} params={lp} info={info} />
        </>
      )}
    </>
  );
}
