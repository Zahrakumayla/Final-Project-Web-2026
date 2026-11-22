import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LateBadge, RestockBadge } from "@/components/ui/status-badges";
import { Row, MiniList } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber } from "@/lib/format";
import { getSupplierDashboard } from "@/services/dashboard";

export default async function SupplierDashboard() {
  const user = await requireRole([ROLES.SUPPLIER]);
  const d = await getSupplierDashboard(user);
  const c = d.counts;
  return (
    <>
      <PageHeader title={user.companyName ?? user.fullName} description="Ringkasan pesanan restock dari AYVORA." actions={<ButtonLink href="/supplier/restock">Lihat pesanan</ButtonLink>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Perlu konfirmasi" value={formatNumber(c.Pending ?? 0)} icon="clock" tone="warning" />
        <StatCard label="Sedang diproses" value={formatNumber((c.Confirmed ?? 0) + (c["In Transit"] ?? 0))} icon="truck" tone="info" />
        <StatCard label="Selesai diterima" value={formatNumber(c.Received ?? 0)} icon="check" tone="success" />
        <StatCard label="Rating rata-rata" value={d.rating.avg ? `${d.rating.avg} / 5` : "-"} hint={`${d.rating.total} penilaian`} icon="star" />
      </div>
      <div className="mt-8">
        <MiniList title="Pesanan terbaru" href="/supplier/restock" empty="Belum ada pesanan." count={d.recent.length}>
          {d.recent.map((p) => <Row key={p.id} href={`/supplier/restock/${p.id}`} primary={p.po_number} secondary={`${formatNumber(p.total_quantity)} unit · estimasi ${formatDate(p.expected_delivery_date)}`} right={<span className="flex items-center gap-1.5"><RestockBadge status={p.status} />{p.is_late && <LateBadge />}</span>} />)}
        </MiniList>
      </div>
    </>
  );
}
