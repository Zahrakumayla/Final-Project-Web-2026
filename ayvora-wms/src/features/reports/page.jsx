import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { getReport, resolveRange } from "@/services/reports";

export default async function ReportsPage({ searchParams }) {
  await requirePermission("REPORT_VIEW");
  const range = resolveRange(await searchParams);
  const r = await getReport(range);
  const t = (type) => r.byType.find((x) => x.type === type) ?? { total: 0, pending: 0, approved: 0, rejected: 0, units: 0, damaged: 0 };
  const inc = t("INCOMING"); const out = t("OUTGOING");
  const qs = `from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeader title="Laporan" description={`Periode ${formatDate(range.from)} - ${formatDate(range.to)}`} />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">Dari<input type="date" name="from" defaultValue={range.from} className="mt-1 block h-11 rounded-xl border border-field-border bg-card px-3 text-sm" /></label>
        <label className="text-sm">Sampai<input type="date" name="to" defaultValue={range.to} className="mt-1 block h-11 rounded-xl border border-field-border bg-card px-3 text-sm" /></label>
        <button type="submit" className="h-11 cursor-pointer rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Terapkan</button>
        <div className="ml-auto flex flex-wrap gap-2">
          <ButtonLink href={`/api/export/transactions?${qs}&status=all`} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Transaksi CSV</ButtonLink>
          <ButtonLink href="/api/export/products" variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Stok CSV</ButtonLink>
          <ButtonLink href="/api/export/restock" variant="outline" prefetch={false}><Icon name="download" className="size-4" /> PO CSV</ButtonLink>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Barang masuk (disetujui)" value={`${formatNumber(inc.units)} unit`} hint={`${inc.total} transaksi · ${inc.damaged} rusak`} icon="inbox" />
        <StatCard label="Barang keluar (disetujui)" value={`${formatNumber(out.units)} unit`} hint={`${out.total} transaksi`} icon="send" tone="info" />
        <StatCard label="Transaksi ditolak" value={inc.rejected + out.rejected} icon="x" tone="danger" />
        <StatCard label="PO pada periode" value={Object.values(r.po).reduce((a, b) => a + b, 0)} hint={`${r.po.Received ?? 0} diterima · ${r.po.Rejected ?? 0} ditolak`} icon="clipboard" tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-0">
          <div className="px-5 pt-5"><CardHeader title="Produk paling banyak keluar" /></div>
          <ul className="divide-y divide-border px-5 pb-3 text-sm">
            {r.topOut.length === 0 && <li className="py-3 text-muted-foreground">Belum ada barang keluar pada periode ini.</li>}
            {r.topOut.map((p, i) => <li key={p.sku} className="flex justify-between py-2.5"><span>{i + 1}. {p.name}</span><span className="font-semibold">{formatNumber(p.total)}</span></li>)}
          </ul>
        </Card>
        <Card className="p-0">
          <div className="px-5 pt-5"><CardHeader title="Laporan masalah" /></div>
          <ul className="divide-y divide-border px-5 pb-3 text-sm">
            {r.issues.length === 0 && <li className="py-3 text-muted-foreground">Tidak ada laporan pada periode ini.</li>}
            {r.issues.map((i) => <li key={i.type} className="flex justify-between py-2.5"><span>{i.type}</span><span className="font-semibold">{i.total}</span></li>)}
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Kinerja supplier</h2>
      <TableWrap>
        <Table>
          <thead><tr><Th>Supplier</Th><Th className="text-right">PO</Th><Th className="text-right">Diterima</Th><Th className="text-right">Ditolak</Th><Th className="text-right">Terlambat</Th><Th className="text-right">Rating</Th></tr></thead>
          <tbody>
            {r.suppliers.map((s) => (
              <tr key={s.company_name}><Td className="font-medium">{s.company_name}</Td><Td className="text-right">{s.total_po}</Td><Td className="text-right">{s.received}</Td><Td className="text-right">{s.rejected}</Td><Td className="text-right">{s.late}</Td><Td className="text-right">{s.avg_rating ?? "-"}</Td></tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <h2 className="mb-3 mt-8 text-base font-semibold">Persediaan per kategori</h2>
      <TableWrap>
        <Table>
          <thead><tr><Th>Kategori</Th><Th className="text-right">Produk</Th><Th className="text-right">Unit</Th><Th className="text-right">Nilai</Th></tr></thead>
          <tbody>
            {r.byCategory.map((c) => <tr key={c.name}><Td className="font-medium">{c.name}</Td><Td className="text-right">{c.products}</Td><Td className="text-right">{formatNumber(c.units)}</Td><Td className="text-right">{formatRupiah(c.value)}</Td></tr>)}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
