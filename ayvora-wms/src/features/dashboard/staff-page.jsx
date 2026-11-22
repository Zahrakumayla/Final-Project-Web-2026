import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DeliveryBadge, StockBadge, TransactionBadge } from "@/components/ui/status-badges";
import { Row, MiniList } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber } from "@/lib/format";
import { getStaffDashboard } from "@/services/dashboard";

export default async function StaffDashboard() {
  const user = await requireRole([ROLES.WAREHOUSE_STAFF]);
  const d = await getStaffDashboard(user);
  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} description="Tugas gudang Anda hari ini." actions={<><ButtonLink href="/staff/incoming/new" variant="outline">Catat Barang Masuk</ButtonLink><ButtonLink href="/staff/outgoing/new">Catat Barang Keluar</ButtonLink></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Masuk hari ini" value={d.today.incoming} icon="inbox" />
        <StatCard label="Keluar hari ini" value={d.today.outgoing} icon="send" tone="info" />
        <StatCard label="Menunggu persetujuan" value={formatNumber(d.mine.Pending ?? 0)} icon="clock" tone="warning" />
        <StatCard label="Disetujui / ditolak" value={`${(d.mine.Approved ?? 0) + (d.mine.Shipped ?? 0)} / ${d.mine.Rejected ?? 0}`} icon="check" tone="success" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <MiniList title="PO siap dicatat" description="PO sudah diterima, belum dicatat sebagai barang masuk." href="/staff/incoming/new" empty="Tidak ada PO yang menunggu dicatat." count={d.receivable.length}>
          {d.receivable.map((p) => <Row key={p.id} href={`/staff/incoming/new?po=${p.id}`} primary={p.po_number} secondary={p.company_name} right="Catat" />)}
        </MiniList>
        <MiniList title="Pengiriman perlu diproses" href="/staff/deliveries" empty="Tidak ada pengiriman aktif." count={d.deliveries.length}>
          {d.deliveries.map((s) => <Row key={s.id} href={`/staff/deliveries/${s.id}`} primary={s.transaction_number} secondary={s.customer_name} right={<DeliveryBadge status={s.delivery_status} />} />)}
        </MiniList>
        <MiniList title="Transaksi terakhir Anda" href="/staff/incoming" empty="Belum ada transaksi." count={d.recent.length}>
          {d.recent.map((t) => <Row key={t.id} href={`/staff/${t.type === "INCOMING" ? "incoming" : "outgoing"}/${t.id}`} primary={t.transaction_number} secondary={`${t.type === "INCOMING" ? "Masuk" : "Keluar"} · ${formatDate(t.transaction_date)}`} right={<TransactionBadge status={t.status} />} />)}
        </MiniList>
        <MiniList title="Stok perlu perhatian" href="/staff/products?status=Low" empty="Semua stok aman." count={d.lowStock.length}>
          {d.lowStock.map((p) => <Row key={p.product_id} href={`/staff/products/${p.product_id}`} primary={p.product_name} secondary={`${formatNumber(p.current_stock)} ${p.unit}`} right={<StockBadge status={p.stock_status} />} />)}
        </MiniList>
      </div>
    </>
  );
}
