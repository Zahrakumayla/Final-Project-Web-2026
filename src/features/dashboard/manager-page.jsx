import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { BarChart } from "@/components/ui/charts";
import { PageHeader } from "@/components/ui/page-header";
import { OutboundBadge, StockBadge } from "@/components/ui/status-badges";
import { Row, MiniList, Section, StockDonut } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/labels";
import { getManagerDashboard } from "@/services/dashboard";

export default async function ManagerDashboard() {
  const user = await requireRole([ROLES.WAREHOUSE_MANAGER]);
  const d = await getManagerDashboard();
  const { kpi } = d;

  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} actions={<><ButtonLink href="/manager/shipments" variant="outline">Pengiriman Masuk</ButtonLink><ButtonLink href="/manager/restock/new">Buat PO</ButtonLink></>} />

      <Section title="Perlu tindakan Anda" hint="Klik kartu untuk langsung membuka daftarnya. Angka 0 berarti tidak ada yang menunggu." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard href="/manager/shipments?stage=needs-inspection" label="Barang tiba, belum diperiksa" value={formatNumber(kpi.to_inspect)} hint="Tugaskan staf untuk memeriksa" icon="truck" tone={kpi.to_inspect ? "warning" : "neutral"} />
        <StatCard href="/manager/inspections" label="Laporan pemeriksaan menunggu disetujui" value={formatNumber(kpi.to_approve)} hint="Setujui agar stok bertambah" icon="check" tone={kpi.to_approve ? "warning" : "neutral"} />
        <StatCard href="/manager/outgoing" label="Barang keluar menunggu disetujui" value={formatNumber(kpi.outbound_pending)} hint={`${kpi.outbound_progress} sedang diproses`} icon="send" tone={kpi.outbound_pending ? "warning" : "neutral"} />
        <StatCard href="/manager/claims" label="Klaim perlu keputusan" value={formatNumber(kpi.claims_action)} hint={`${kpi.open_claims} klaim aktif ke supplier`} icon="alert" tone={kpi.claims_action ? "danger" : "neutral"} />
      </div>

      <Section title="Gambaran gudang" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard href="/manager/inventory" label="Stok di gudang" value={formatNumber(kpi.physical)} hint={`${formatNumber(kpi.allocated)} sudah dipesan untuk barang keluar · nilai ${formatRupiah(kpi.stock_value)}`} icon="warehouse" />
        <StatCard href="/manager/inventory" label="Produk perlu restock" value={formatNumber(d.stock.Low + d.stock.Severe + d.stock["Out of Stock"])} hint={`${d.stock.Severe} kritis · ${d.stock["Out of Stock"]} habis`} icon="alert" tone={d.stock.Low + d.stock.Severe + d.stock["Out of Stock"] ? "danger" : "success"} />
        <StatCard href="/manager/restock" label="PO yang sedang berjalan" value={formatNumber(kpi.active_po)} hint={`${kpi.in_transit} pengiriman sedang di jalan`} icon="clipboard" tone="info" />
      </div>

      <Section title="Perlu dipantau" />
      
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="h-full">
          <CardHeader title="Stok masuk dan keluar 7 hari terakhir" />
          <BarChart series={[{ name: "Masuk", tone: "primary" }, { name: "Keluar", tone: "info" }]} data={d.daily.map((x) => ({ label: formatDate(x.day).slice(0, 6), values: [x.incoming, x.outgoing] }))} />
        </Card>
          <StockDonut stock={d.stock} />
          <MiniList title="PO terlambat" href="/manager/restock?late=1" empty="Tidak ada PO yang terlambat." count={d.latePos.length}>
          {d.latePos.map((p) => <Row key={p.id} href={`/manager/restock/${p.id}`} primary={p.po_number} secondary={p.supplier_company} right={`Estimasi ${formatDate(p.expected_delivery_date)}`} />)}
        </MiniList>
          <MiniList title="Stok masuk dan keluar terbaru" href="/manager/inventory?view=movements" empty="Belum ada pergerakan." count={d.movements.length}>
          {d.movements.map((m, i) => <Row key={i} primary={m.name} secondary={MOVEMENT_LABEL[m.movement_type]} right={<span className={m.quantity_change < 0 ? "text-destructive" : "text-success"}>{m.quantity_change > 0 ? "+" : ""}{m.quantity_change}</span>} />)}
        </MiniList>
          <MiniList wide title="Produk perlu restock" href="/manager/inventory" empty="Semua stok aman." count={d.lowStock.length}>
          {d.lowStock.map((p) => <Row key={p.product_id} href={`/manager/products/${p.product_id}`} primary={p.product_name} secondary={`${p.sku} · tersedia ${formatNumber(p.available_stock)} ${p.unit}`} right={<StockBadge status={p.stock_status} />} />)}
        </MiniList>
      </div>
    </>
  );
}
