import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { BarChart } from "@/components/ui/charts";
import { PageHeader } from "@/components/ui/page-header";
import { StockBadge } from "@/components/ui/status-badges";
import { Row, MiniList, StockDonut } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import { getManagerDashboard } from "@/services/dashboard";

const MOVEMENT = { OPENING: "Stok awal", INCOMING: "Barang masuk", OUTGOING: "Barang keluar", ADJUSTMENT: "Penyesuaian" };

export default async function ManagerDashboard() {
  const user = await requireRole([ROLES.WAREHOUSE_MANAGER]);
  const d = await getManagerDashboard();
  const { kpi } = d;

  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} description="Kondisi gudang hari ini." actions={<><ButtonLink href="/manager/transactions" variant="outline">Persetujuan</ButtonLink><ButtonLink href="/manager/restock/new">Buat PO</ButtonLink></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total stok" value={formatNumber(kpi.total_stock)} hint={`Nilai ${formatRupiah(kpi.stock_value)}`} icon="warehouse" />
        <StatCard label="Menunggu persetujuan" value={formatNumber(kpi.pending_tx)} icon="check" tone="warning" />
        <StatCard label="PO berjalan" value={formatNumber(kpi.active_po)} icon="clipboard" tone="info" />
        <StatCard label="Pengiriman aktif" value={formatNumber(kpi.active_shipments)} icon="truck" tone="info" />
        <StatCard label="Stok bermasalah" value={formatNumber(d.stock.Low + d.stock.Severe + d.stock["Out of Stock"])} hint={`${d.stock.Severe} severe, ${d.stock["Out of Stock"]} habis`} icon="alert" tone="danger" />
        <StatCard label="Laporan masalah terbuka" value={formatNumber(kpi.open_issues)} icon="alert" tone="warning" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <StockDonut stock={d.stock} />
        <Card>
          <CardHeader title="Transaksi 7 hari terakhir" description="Jumlah transaksi (tidak termasuk yang ditolak)." />
          <BarChart series={[{ name: "Masuk", tone: "primary" }, { name: "Keluar", tone: "info" }]} data={d.daily.map((x) => ({ label: formatDate(x.day).slice(0, 6), values: [x.incoming, x.outgoing] }))} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MiniList title="Perlu restock" description="Stok Low, Severe, atau habis." href="/manager/inventory" empty="Semua stok aman." count={d.lowStock.length}>
          {d.lowStock.map((p) => <Row key={p.product_id} href={`/manager/products/${p.product_id}`} primary={p.product_name} secondary={`${p.sku} · ${formatNumber(p.current_stock)} ${p.unit}`} right={<StockBadge status={p.stock_status} />} />)}
        </MiniList>
        <MiniList title="Menunggu persetujuan" href="/manager/transactions" empty="Tidak ada transaksi Pending." count={d.pending.length}>
          {d.pending.map((t) => <Row key={t.id} href={`/manager/transactions/${t.id}`} primary={t.transaction_number} secondary={`${t.type === "INCOMING" ? "Masuk" : "Keluar"} · ${t.created_by_name}`} right={formatDate(t.transaction_date)} />)}
        </MiniList>
        <MiniList title="PO terlambat" href="/manager/restock?late=1" empty="Tidak ada PO yang terlambat." count={d.latePos.length}>
          {d.latePos.map((p) => <Row key={p.id} href={`/manager/restock/${p.id}`} primary={p.po_number} secondary={p.supplier_company} right={`Estimasi ${formatDate(p.expected_delivery_date)}`} />)}
        </MiniList>
        <MiniList title="Pergerakan stok terbaru" href="/manager/inventory" empty="Belum ada pergerakan." count={d.movements.length}>
          {d.movements.map((m, i) => <Row key={i} primary={m.name} secondary={MOVEMENT[m.movement_type] ?? m.movement_type} right={<span className={m.quantity_change < 0 ? "text-destructive" : "text-success"}>{m.quantity_change > 0 ? "+" : ""}{m.quantity_change}</span>} />)}
        </MiniList>
      </div>
    </>
  );
}
