import { statusOptions } from "@/lib/labels";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { StockBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { getHomePath } from "@/lib/permissions";
import { listAllCategories } from "@/services/categories";
import { inventorySummary, listInventory, listMovements } from "@/services/inventory";

const MOVE_LABEL = { OPENING: "Stok awal", INCOMING: "Masuk", OUTGOING: "Keluar" };

export default async function InventoryPage({ searchParams }) {
  const user = await requirePermission("INVENTORY_VIEW");
  const BASE = `${getHomePath(user.role)}/inventory`;
  const raw = (await searchParams) ?? {};
  const view = raw.view === "movements" ? "movements" : "stock";
  const summary = await inventorySummary();

  return (
    <>
      <PageHeader title="Inventori" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stok fisik" value={formatNumber(summary.units)} hint={`${summary.products} produk aktif`} icon="warehouse" />
        <StatCard label="Dialokasikan / tersedia" value={`${formatNumber(summary.allocated)} / ${formatNumber(summary.available)}`} hint="Untuk barang keluar yang disetujui" icon="package" tone="primary" />
        <StatCard label="Nilai persediaan" value={formatRupiah(summary.value)} icon="chart" tone="info" />
        <StatCard label="Perlu perhatian" value={summary.attention} hint="Menipis, kritis, atau habis" icon="alert" tone="warning" />
      </div>
      <div className="mb-4 flex gap-2">
        <ButtonLink href={buildHref(BASE, {}, { view: "" })} size="sm" variant={view === "stock" ? "primary" : "outline"}>Stok saat ini</ButtonLink>
        <ButtonLink href={buildHref(BASE, {}, { view: "movements" })} size="sm" variant={view === "movements" ? "primary" : "outline"}>Riwayat pergerakan</ButtonLink>
      </div>
      {view === "stock" ? <StockView raw={raw} BASE={BASE} /> : <MovementView raw={raw} BASE={BASE} />}
    </>
  );
}

async function StockView({ raw, BASE }) {
  const [{ rows, params, info }, categories] = await Promise.all([listInventory(raw), listAllCategories()]);
  const lp = linkParams(params);
  return (
    <>
      <FilterBar basePath={BASE} params={params} placeholder="Cari produk atau SKU" filters={[
        { name: "category", label: "Semua kategori", options: categories.map((c) => ({ value: c.id, label: c.name })) },
        { name: "status", label: "Semua status", options: statusOptions(["Normal", "Low", "Severe", "Out of Stock"]) },
      ]} />
      {rows.length === 0 ? <EmptyState icon="warehouse" title="Produk tidak ditemukan" /> : (
        <>
          <TableWrap>
            <Table>
              <thead><tr>
                <SortTh label="Produk" sortKey="name" basePath={BASE} params={lp} />
                <SortTh label="Kategori" sortKey="category" basePath={BASE} params={lp} />
                <Th>Stok per rak</Th>
                <SortTh label="Fisik" sortKey="stock" basePath={BASE} params={lp} className="text-right" />
                <SortTh label="Dialokasikan" sortKey="allocated" basePath={BASE} params={lp} className="text-right" />
                <SortTh label="Tersedia" sortKey="available" basePath={BASE} params={lp} className="text-right" />
                <Th>Status</Th>
                <SortTh label="Nilai" sortKey="value" basePath={BASE} params={lp} className="text-right" />
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product_id} className="hover:bg-muted/40">
                    <Td><span className="font-medium">{row.product_name}</span><span className="block text-xs text-muted-foreground">{row.sku}</span></Td>
                    <Td>{row.category_name}</Td>
                    <Td>{row.racks.length ? row.racks.map((r) => `${r.rack}: ${r.quantity}`).join(", ") : "-"}</Td>
                    <Td className="whitespace-nowrap text-right">{formatNumber(row.physical_stock)}</Td>
                    <Td className="whitespace-nowrap text-right">{formatNumber(row.allocated_stock)}</Td>
                    <Td className="whitespace-nowrap text-right font-medium">{formatNumber(row.available_stock)} {row.unit}</Td>
                    <Td><StockBadge status={row.stock_status} /></Td>
                    <Td className="whitespace-nowrap text-right">{formatRupiah(row.stock_value)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={BASE} params={lp} info={info} />
        </>
      )}
    </>
  );
}

async function MovementView({ raw, BASE }) {
  const { rows, params, info } = await listMovements(raw);
  const lp = { ...linkParams(params), view: "movements" };
  const exportHref = `/api/export/movements?${new URLSearchParams(Object.entries(lp).filter(([k, v]) => v && k !== "view")).toString()}`;
  return (
    <>
      <FilterBar basePath={BASE} params={params} placeholder="Cari produk, SKU, nomor pemeriksaan / barang keluar / PO"
        filters={[{ name: "type", label: "Semua jenis", options: Object.entries(MOVE_LABEL).map(([value, label]) => ({ value, label })) }]}
        extra={<>
          <input type="hidden" name="view" value="movements" />
          <input type="date" name="from" defaultValue={params.filters.from} aria-label="Dari tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          <input type="date" name="to" defaultValue={params.filters.to} aria-label="Sampai tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> CSV</ButtonLink>
        </>} />
      {rows.length === 0 ? <EmptyState icon="history" title="Belum ada pergerakan" /> : (
        <>
          <TableWrap>
            <Table>
              <thead><tr>
                <SortTh label="Waktu" sortKey="date" basePath={BASE} params={lp} />
                <SortTh label="Produk" sortKey="product" basePath={BASE} params={lp} />
                <Th>Jenis</Th><Th>Rak</Th>
                <Th className="text-right">Sebelum</Th>
                <SortTh label="Perubahan" sortKey="qty" basePath={BASE} params={lp} className="text-right" />
                <Th className="text-right">Sesudah</Th><Th>Sumber</Th><Th>Penyetuju / pelaku</Th>
              </tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(m.created_at)}</Td>
                    <Td><span className="font-medium">{m.product_name}</span><span className="block text-xs text-muted-foreground">{m.sku}</span></Td>
                    <Td>{MOVE_LABEL[m.movement_type]}</Td><Td>{m.rack_code ?? "-"}</Td>
                    <Td className="text-right">{formatNumber(m.quantity_before)}</Td>
                    <Td className={`text-right font-medium ${m.quantity_change < 0 ? "text-destructive" : "text-success"}`}>{m.quantity_change > 0 ? "+" : ""}{formatNumber(m.quantity_change)}</Td>
                    <Td className="text-right">{formatNumber(m.quantity_after)}</Td>
                    <Td className="whitespace-nowrap">{m.source_number ?? m.notes ?? "-"}{(m.po_number || m.claim_number) && <span className="block text-xs text-muted-foreground">{[m.po_number, m.claim_number].filter(Boolean).join(" · ")}</span>}</Td>
                    <Td>{m.created_by_name ?? "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={BASE} params={lp} info={info} />
        </>
      )}
    </>
  );
}
