import Link from "next/link";
import { restoreProductAction } from "@/actions/products";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ProductImage } from "@/components/ui/product-image";
import { StockBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatNumber, formatRupiah } from "@/lib/format";
import { statusOptions } from "@/lib/labels";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listAllCategories } from "@/services/categories";
import { listProducts } from "@/services/products";


const STATUS_OPTIONS = statusOptions(["Normal", "Low", "Severe", "Out of Stock"]);

export default async function ProductListPage({ searchParams }) {
  const user = await requirePermission("PRODUCT_VIEW");
  const base = `${getHomePath(user.role)}/products`;
  const canManage = can(user, "PRODUCT_MANAGE");
  const canExport = can(user, "EXPORT_PRODUCTS");
  const [{ rows, params, info }, categories] = await Promise.all([listProducts(await searchParams), listAllCategories()]);
  const archived = params.filters.archived === "1";
  const lp = linkParams(params);
  const exportHref = `/api/export/products?${new URLSearchParams(Object.entries(lp).filter(([, v]) => v)).toString()}`;

  return (
    <>
      <PageHeader
        title={canManage ? "Kelola Produk" : "Produk & Lokasi"}
        actions={
          <>
            {canExport && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
            {canManage && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Tambah Produk</ButtonLink>}
          </>
        }
      />

      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nama, SKU, atau kategori"
        filters={[
          { name: "category", label: "Semua kategori", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "status", label: "Semua status stok", options: STATUS_OPTIONS },
          ...(canManage ? [{ name: "archived", label: "Produk aktif", options: [{ value: "1", label: "Diarsipkan" }] }] : []),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon="box" title="Produk tidak ditemukan" description="Coba ubah kata kunci atau filter pencarian." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Produk</Th>
                  <SortTh label="SKU" sortKey="sku" basePath={base} params={lp} />
                  <SortTh label="Kategori" sortKey="category" basePath={base} params={lp} />
                  <SortTh label="Stok tersedia" sortKey="stock" basePath={base} params={lp} className="text-right" />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <Th>Rak</Th>
                  <SortTh label="Harga beli" sortKey="price" basePath={base} params={lp} className="text-right" />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product_id} className="hover:bg-muted/40">
                    <Td>
                      <Link href={`${base}/${row.product_id}`} className="flex items-center gap-3">
                        <ProductImage src={row.image_url} alt="" className="size-11" />
                        <span className="min-w-0 font-medium hover:underline">{row.product_name}</span>
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{row.sku}</Td>
                    <Td>{row.category_name}</Td>
                    <Td className="whitespace-nowrap text-right font-medium">{formatNumber(row.available_stock)} {row.unit}</Td>
                    <Td><StockBadge status={row.stock_status} /></Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{row.rack_codes ?? "-"}</Td>
                    <Td className="whitespace-nowrap text-right">{formatRupiah(row.buy_price)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <ButtonLink href={`${base}/${row.product_id}`} variant="outline" size="sm">Detail</ButtonLink>
                        {canManage && archived && (
                          <ActionDialog triggerLabel="Aktifkan" title="Aktifkan kembali produk?" description={`${row.product_name} akan muncul lagi di daftar produk aktif.`} action={restoreProductAction} fields={{ productId: row.product_id }} confirmLabel="Aktifkan" />
                        )}
                      </div>
                    </Td>
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
