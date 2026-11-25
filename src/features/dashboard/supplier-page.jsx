import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ClaimBadge, LateBadge, RestockBadge } from "@/components/ui/status-badges";
import { Row, MiniList, Section } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber } from "@/lib/format";
import { CLAIM_TYPE_LABEL } from "@/lib/labels";
import { getSupplierDashboard } from "@/services/dashboard";
import { poStage } from "@/services/restock";

export default async function SupplierDashboard() {
  const user = await requireRole([ROLES.SUPPLIER]);
  const d = await getSupplierDashboard(user);
  const c = d.counts;
  return (
    <>
      <PageHeader title={user.companyName ?? user.fullName} actions={<ButtonLink href="/supplier/restock">Lihat pesanan</ButtonLink>} />
      <Section title="Pesanan dari gudang" hint="Klik kartu untuk membuka daftarnya." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        <StatCard href="/supplier/restock" label="Pesanan perlu dikonfirmasi" value={formatNumber(c.pending)} hint="Terima atau tolak pesanan" icon="clock" tone={c.pending ? "warning" : "neutral"} />
        <StatCard href="/supplier/restock" label="Pesanan siap dikirim" value={formatNumber(c.to_ship)} hint="Isi data pengiriman" icon="package" tone={c.to_ship ? "warning" : "neutral"} />
        <StatCard href="/supplier/restock" label="Sedang dalam perjalanan" value={formatNumber(c.in_transit)} hint="Unggah foto saat barang tiba" icon="truck" tone="info" />
        <StatCard href="/supplier/history" label="Sudah diterima gudang" value={formatNumber(c.received)} icon="check" tone="success" />
      </div>

      <Section title="Daftar" />
      
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MiniList title="Klaim yang perlu Anda tangani" href="/supplier/claims" empty="Tidak ada klaim yang menunggu Anda." count={d.claims.length}>
          {d.claims.map((cl) => <Row key={cl.id} href={`/supplier/claims/${cl.id}`} primary={cl.claim_number} secondary={`${CLAIM_TYPE_LABEL[cl.claim_type]} · ${cl.product_name}${cl.requested_resolution ? ` · diminta ${cl.requested_resolution === "Refund" ? "refund" : "pengganti"}` : ""}`} right={<ClaimBadge status={cl.refund_proof_invalid ? "Refund Processing" : cl.status} />} />)}
        </MiniList>
          <MiniList title="Pesanan terbaru" href="/supplier/restock" empty="Belum ada pesanan." count={d.recent.length}>
          {d.recent.map((p) => <Row key={p.id} href={`/supplier/restock/${p.id}`} primary={p.po_number} secondary={`${formatNumber(p.total_quantity)} unit · estimasi ${formatDate(p.expected_delivery_date)}`} right={<span className="flex items-center gap-1.5"><RestockBadge status={poStage(p)} />{p.is_late && <LateBadge />}</span>} />)}
        </MiniList>
      </div>
    </>
  );
}
