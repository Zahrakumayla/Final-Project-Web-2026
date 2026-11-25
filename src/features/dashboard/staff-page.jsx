import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalBadge, InspectionBadge, OutboundBadge, StockBadge } from "@/components/ui/status-badges";
import { Row, MiniList, Section } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatNumber } from "@/lib/format";
import { getStaffDashboard } from "@/services/dashboard";

export default async function StaffDashboard() {
  const user = await requireRole([ROLES.WAREHOUSE_STAFF]);
  const d = await getStaffDashboard(user);
  const c = d.counts;
  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} actions={<><ButtonLink href="/staff/inspections" variant="outline">Tugas Pemeriksaan</ButtonLink><ButtonLink href="/staff/outgoing/new">Buat Laporan Barang Keluar</ButtonLink></>} />
      <Section title="Tugas Anda" hint="Klik kartu untuk membuka daftarnya." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard href="/staff/inspections" label="Barang masuk yang harus diperiksa" value={formatNumber(c.awaiting)} hint={`${c.under} sedang Anda periksa`} icon="check" tone={c.awaiting ? "warning" : "neutral"} />
        <StatCard href="/staff/inspections" label="Laporan pemeriksaan perlu direvisi" value={formatNumber(c.revision)} hint="Dikembalikan Manager" icon="alert" tone={c.revision ? "danger" : "neutral"} />
        <StatCard href="/staff/outgoing" label="Barang keluar siap disiapkan atau dikirim" value={formatNumber(c.to_prepare)} hint="Sudah disetujui Manager" icon="send" tone={c.to_prepare ? "info" : "neutral"} />
        <StatCard href="/staff/outgoing" label="Laporan barang keluar ditolak" value={formatNumber(c.rejected)} hint={`${c.pending} menunggu persetujuan Manager`} icon="clock" tone={c.rejected ? "danger" : "neutral"} />
      </div>

      <Section title="Daftar tugas" />
      
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MiniList title="Pemeriksaan barang masuk" href="/staff/inspections" empty="Tidak ada tugas pemeriksaan aktif." count={d.tasks.length}>
          {d.tasks.map((t) => <Row key={t.id} href={`/staff/inspections/${t.id}`} primary={t.inspection_number} secondary={`${t.po_number}${t.kind === "Replacement" ? " · barang pengganti" : ""}`} right={<span className="flex gap-1.5"><InspectionBadge status={t.status} /><ApprovalBadge status={t.approval_status} /></span>} />)}
        </MiniList>
          <MiniList title="Stok menipis atau habis" href="/staff/products?status=Low" empty="Semua stok aman." count={d.lowStock.length}>
          {d.lowStock.map((p) => <Row key={p.product_id} href={`/staff/products/${p.product_id}`} primary={p.product_name} secondary={`Tersedia ${formatNumber(p.available_stock)} ${p.unit}`} right={<StockBadge status={p.stock_status} />} />)}
        </MiniList>
          <MiniList wide title="Barang keluar yang perlu diproses" href="/staff/outgoing" empty="Tidak ada barang keluar yang perlu diproses." count={d.outbound.length}>
          {d.outbound.map((o) => <Row key={o.id} href={`/staff/outgoing/${o.id}`} primary={o.order_number} secondary={o.customer_name} right={<OutboundBadge status={o.status} />} />)}
        </MiniList>
      </div>
    </>
  );
}
