import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { BarChart } from "@/components/ui/charts";
import { PageHeader } from "@/components/ui/page-header";
import { Row, MiniList, StockDonut } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber } from "@/lib/format";
import { getAdminDashboard } from "@/services/dashboard";

export default async function AdminDashboard() {
  const user = await requireRole([ROLES.ADMIN]);
  const data = await getAdminDashboard();
  const { tx, suppliers } = data;

  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} description="Ringkasan data master dan aktivitas gudang." actions={<ButtonLink href="/admin/products/new">Tambah Produk</ButtonLink>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produk aktif" value={formatNumber(data.totals.products)} icon="box" />
        <StatCard label="Kategori" value={formatNumber(data.totals.categories)} icon="tag" tone="info" />
        <StatCard label="Supplier disetujui" value={formatNumber(suppliers.Approved ?? 0)} icon="users" tone="success" />
        <StatCard label="Menunggu verifikasi" value={formatNumber(suppliers.Pending ?? 0)} icon="shield" tone="warning" hint={suppliers.Rejected ? `${suppliers.Rejected} ditolak` : undefined} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-semibold">Ringkasan transaksi</h2>
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">Hanya jumlah. Detail transaksi dikelola oleh Manager dan Staff.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total transaksi" value={formatNumber(tx.total)} icon="clipboard" />
        <StatCard label="Barang masuk" value={formatNumber(tx.incoming)} icon="inbox" tone="info" />
        <StatCard label="Barang keluar" value={formatNumber(tx.outgoing)} icon="send" tone="info" />
        <StatCard label="Menunggu persetujuan" value={formatNumber(tx.pending)} icon="clock" tone="warning" />
        <StatCard label="Disetujui / ditolak" value={`${formatNumber(tx.approved)} / ${formatNumber(tx.rejected)}`} icon="check" tone="success" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <StockDonut stock={data.stock} />
        <Card>
          <CardHeader title="Produk per kategori" description="Jumlah produk aktif." />
          <BarChart series={[{ name: "Produk", tone: "primary" }]} data={data.byCategory.map((c) => ({ label: c.name.replace(" Packaging", "").replace(" Supplies", ""), values: [c.total] }))} />
        </Card>
      </div>

      <div className="mt-6">
        <MiniList title="Supplier menunggu verifikasi" href="/admin/suppliers?status=Pending" empty="Tidak ada pendaftaran yang menunggu." count={data.pendingSuppliers.length}>
          {data.pendingSuppliers.map((s) => <Row key={s.id} href={`/admin/suppliers/${s.id}`} primary={s.company_name} secondary={`${s.full_name} · daftar ${formatDate(s.created_at)}`} right="Tinjau" />)}
        </MiniList>
      </div>
    </>
  );
}
