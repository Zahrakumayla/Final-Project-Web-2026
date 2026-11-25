import { notFound } from "next/navigation";
import { deleteProductAction } from "@/actions/products";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ProductImage } from "@/components/ui/product-image";
import { StockBadge } from "@/components/ui/status-badges";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/shared/icons";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { getProduct } from "@/services/products";


function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function ProductDetailPage({ params }) {
  const user = await requirePermission("PRODUCT_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const product = await getProduct(id);
  if (!product) notFound();

  const base = getHomePath(user.role);
  const canManage = can(user, "PRODUCT_MANAGE");
  const canRestock = can(user, "RESTOCK_CREATE");
  const hasStock = product.current_stock > 0;
  const needsRestock = product.is_active && ["Low", "Severe", "Out of Stock"].includes(product.stock_status);

  return (
    <>
      <PageHeader
        title={product.product_name}
        description={`${product.sku} - ${product.category_name}`}
        actions={
          <>
            <ButtonLink href={`${base}/products`} variant="outline">Kembali</ButtonLink>
            {canRestock && needsRestock && <ButtonLink href={`${base}/restock/new?productId=${product.product_id}`}><Icon name="clipboard" className="size-4" /> Buat PO untuk Produk Ini</ButtonLink>}
            {canRestock && product.is_active && !needsRestock && <ButtonLink href={`${base}/restock/new?productId=${product.product_id}`} variant="outline"><Icon name="clipboard" className="size-4" /> Buat PO</ButtonLink>}
            {canManage && <ButtonLink href={`${base}/products/${product.product_id}/edit`} variant="secondary">Ubah</ButtonLink>}
            {canManage && (
              <ActionDialog
                triggerLabel="Hapus"
                triggerVariant="danger"
                triggerSize="md"
                title="Hapus produk?"
                description="Produk yang belum pernah dipakai akan dihapus permanen. Produk yang sudah punya riwayat transaksi akan diarsipkan agar riwayatnya tetap utuh."
                action={deleteProductAction}
                fields={{ productId: product.product_id }}
                confirmLabel="Hapus produk"
                confirmVariant="danger"
              >
                {hasStock && (
                  <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
                    <input type="checkbox" name="confirmStock" value="yes" className="mt-0.5 size-4 accent-primary" />
                    <span>Produk ini masih memiliki stok {formatNumber(product.current_stock)} {product.unit}. Saya paham dan tetap ingin melanjutkan.</span>
                  </label>
                )}
              </ActionDialog>
            )}
          </>
        }
      />

      {canRestock && needsRestock && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 text-warning">
          <p className="text-sm font-medium">
            Stok tersedia {formatNumber(product.available_stock)} {product.unit} ({product.stock_status === "Out of Stock" ? "habis" : product.stock_status === "Severe" ? "sangat rendah" : "rendah"}, batas {formatNumber(product.low_stock)}). Segera pesan ke supplier.
          </p>
          <ButtonLink href={`${base}/restock/new?productId=${product.product_id}`}><Icon name="clipboard" className="size-4" /> Buat PO sekarang</ButtonLink>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-1">
          <ProductImage src={product.image_url} alt={product.product_name} className="mb-4 aspect-square w-full" rounded="rounded-xl" />
          <div className="flex flex-wrap items-center gap-2">
            <StockBadge status={product.stock_status} />
            {!product.is_active && <Badge tone="neutral">Diarsipkan</Badge>}
          </div>
          <p className="mt-3 text-3xl font-semibold">{formatNumber(product.current_stock)} <span className="text-base font-normal text-muted-foreground">{product.unit}</span></p>
          <p className="text-xs text-muted-foreground">Stok fisik di semua rak</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Dialokasikan</dt><dd className="font-semibold">{formatNumber(product.allocated_stock)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Stok tersedia</dt><dd className="font-semibold">{formatNumber(product.available_stock)}</dd></div>
          </dl>
        </Card>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Informasi produk" />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="SKU">{product.sku}</Info>
              <Info label="Kategori">{product.category_name}</Info>
              <Info label="Harga beli">{formatRupiah(product.buy_price)}</Info>
              <Info label="Harga jual">{formatRupiah(product.sell_price)}</Info>
              <Info label="Stok minimum (status Kritis)">{formatNumber(product.min_stock)} {product.unit}</Info>
              <Info label="Batas stok rendah (status Menipis)">{formatNumber(product.low_stock)} {product.unit}</Info>
              <Info label="Nilai stok">{formatRupiah(product.stock_value)}</Info>
              <Info label="Dibuat">{formatDate(product.created_at)}</Info>
            </dl>
            {product.description && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{product.description}</p>}
          </Card>

          <Card>
            <CardHeader title="Lokasi rak" />
            {product.locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Produk belum memiliki lokasi rak.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {product.locations.map((loc) => (
                  <span key={loc.rack_id} className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">
                    <span className="font-semibold">{loc.rack_code}</span> <span className="text-muted-foreground">- {formatNumber(loc.quantity)} {product.unit}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          <div>
            <h2 className="mb-3 text-base font-semibold">5 pergerakan stok terakhir</h2>
            {product.recentMovements.length === 0 ? (
              <Card><p className="text-sm text-muted-foreground">Belum ada pergerakan stok untuk produk ini.</p></Card>
            ) : (
              <TableWrap>
                <Table>
                  <thead><tr><Th>Waktu</Th><Th>Sumber</Th><Th>Rak</Th><Th className="text-right">Sebelum</Th><Th className="text-right">Perubahan</Th><Th className="text-right">Sesudah</Th><Th>Oleh</Th></tr></thead>
                  <tbody>
                    {product.recentMovements.map((m) => (
                      <tr key={m.id}>
                        <Td className="whitespace-nowrap">{formatDateTime(m.created_at)}</Td>
                        <Td className="whitespace-nowrap font-medium">{m.source_number}{m.po_number && <span className="block text-xs text-muted-foreground">{m.po_number}</span>}</Td>
                        <Td>{m.rack_code}</Td>
                        <Td className="text-right">{formatNumber(m.quantity_before)}</Td>
                        <Td className={`text-right font-semibold ${m.quantity_change < 0 ? "text-destructive" : "text-success"}`}>{m.quantity_change > 0 ? "+" : ""}{formatNumber(m.quantity_change)}</Td>
                        <Td className="text-right">{formatNumber(m.quantity_after)}</Td>
                        <Td>{m.created_by_name ?? "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
