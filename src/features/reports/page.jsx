import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { CLAIM_TYPE_LABEL } from "@/lib/labels";
import { getReport, resolveRange } from "@/services/reports";

export default async function ReportsPage({ searchParams }) {
  await requirePermission("REPORT_VIEW");
  const range = resolveRange(await searchParams);
  const r = await getReport(range);
  const out = (status) => r.outbound.find((x) => x.status === status) ?? { total: 0, shipped_units: 0 };
  const outTotal = r.outbound.reduce((sum, x) => sum + x.total, 0);
  const qs = `from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader title="Laporan" description={`Periode ${formatDate(range.from)} - ${formatDate(range.to)}`} />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">Dari<input type="date" name="from" defaultValue={range.from} className="mt-1 block h-10 rounded-lg border border-field-border bg-card px-3 text-sm" /></label>
        <label className="text-sm">Sampai<input type="date" name="to" defaultValue={range.to} className="mt-1 block h-10 rounded-lg border border-field-border bg-card px-3 text-sm" /></label>
        <button type="submit" className="h-10 cursor-pointer rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Tampilkan</button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Unduh data (CSV):</span>
          <ButtonLink href={`/api/export/outbound?${qs}&status=all`} variant="outline" size="sm" prefetch={false}><Icon name="download" className="size-4" /> Barang keluar</ButtonLink>
          <ButtonLink href={`/api/export/movements?${qs}`} variant="outline" size="sm" prefetch={false}><Icon name="download" className="size-4" /> Riwayat stok</ButtonLink>
          <ButtonLink href="/api/export/products" variant="outline" size="sm" prefetch={false}><Icon name="download" className="size-4" /> Data stok</ButtonLink>
          <ButtonLink href="/api/export/restock" variant="outline" size="sm" prefetch={false}><Icon name="download" className="size-4" /> Data PO</ButtonLink>
        </div>
      </form>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard label="Barang masuk ke gudang" value={`${formatNumber(r.inbound.good)} unit`} hint={`dari ${formatNumber(r.inbound.ordered)} unit yang dipesan`} icon="inbox" tone="success" />
        <StatCard label="Barang bermasalah" value={`${formatNumber(r.inbound.damaged + r.inbound.shortage)} unit`} hint={`${formatNumber(r.inbound.damaged)} rusak · ${formatNumber(r.inbound.shortage)} kurang (tidak masuk stok)`} icon="alert" tone={r.inbound.damaged + r.inbound.shortage ? "danger" : "neutral"} />
        <StatCard label="Barang keluar terkirim" value={`${formatNumber(out("Shipped").shipped_units)} unit`} hint={`${out("Shipped").total} dari ${outTotal} laporan barang keluar`} icon="send" tone="info" />
        <StatCard label="Pesanan ke supplier (PO)" value={Object.values(r.po).reduce((a, b) => a + b, 0)} hint={`${r.po.Received ?? 0} diterima penuh · ${r.po["Partially Received"] ?? 0} diterima sebagian`} icon="clipboard" tone="warning" />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Produk paling banyak dikirim" />
          <ul className="divide-y divide-border text-sm">
            {r.topOut.length === 0 && <li className="py-3 text-muted-foreground">Belum ada barang keluar terkirim pada periode ini.</li>}
            {r.topOut.map((p, i) => <li key={p.sku} className="flex justify-between py-2.5"><span>{i + 1}. {p.name}</span><span className="font-semibold">{formatNumber(p.total)} unit</span></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Klaim ke supplier" />
          <ul className="divide-y divide-border text-sm">
            {r.claims.length === 0 && <li className="py-3 text-muted-foreground">Tidak ada klaim pada periode ini.</li>}
            {r.claims.map((c) => (
              <li key={c.type} className="flex justify-between gap-2 py-2.5">
                <span>{CLAIM_TYPE_LABEL[c.type]}<span className="block text-xs text-muted-foreground">{formatNumber(c.units)} unit{c.refunded > 0 ? ` · refund ${formatRupiah(c.refunded)}` : ""}</span></span>
                <span className="text-right"><span className="font-semibold">{c.total} klaim</span><span className="block text-xs text-muted-foreground">{c.closed} selesai</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Kinerja supplier</h2>
      <TableWrap>
        <Table>
          <thead><tr><Th>Supplier</Th><Th className="text-right">Jumlah PO</Th><Th className="text-right">Diterima</Th><Th className="text-right">Terlambat</Th><Th className="text-right">Klaim</Th></tr></thead>
          <tbody>
            {r.suppliers.map((s) => (
              <tr key={s.company_name}><Td className="font-medium">{s.company_name}</Td><Td className="text-right">{s.total_po}</Td><Td className="text-right">{s.received}</Td><Td className="text-right">{s.late}</Td><Td className="text-right">{s.claims}</Td></tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <h2 className="mb-3 mt-8 text-base font-semibold">Persediaan per kategori</h2>
      <TableWrap>
        <Table>
          <thead><tr><Th>Kategori</Th><Th className="text-right">Produk</Th><Th className="text-right">Stok di gudang</Th><Th className="text-right">Nilai stok</Th></tr></thead>
          <tbody>
            {r.byCategory.map((c) => <tr key={c.name}><Td className="font-medium">{c.name}</Td><Td className="text-right">{c.products}</Td><Td className="text-right">{formatNumber(c.units)}</Td><Td className="text-right">{formatRupiah(c.value)}</Td></tr>)}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
