import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Row, MiniList, Section, StockDonut } from "@/features/dashboard/parts";
import { requireRole } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/config";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { getAdminDashboard } from "@/services/dashboard";

// Admin: pengguna, verifikasi supplier, data master, aktivitas sistem. Admin tidak ikut alur stok.
export default async function AdminDashboard() {
  const user = await requireRole([ROLES.ADMIN]);
  const d = await getAdminDashboard();
  const u = (role) => d.users[role] ?? { total: 0, active: 0 };

  return (
    <>
      <PageHeader title={`Halo, ${user.fullName.split(" ")[0]}`} actions={<><ButtonLink href="/admin/users/new" variant="outline">Tambah Pengguna</ButtonLink><ButtonLink href="/admin/products/new">Tambah Produk</ButtonLink></>} />

      <Section title="Perlu tindakan Anda" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard href="/admin/suppliers?status=Pending" label="Supplier menunggu verifikasi" value={formatNumber(d.suppliers.Pending ?? 0)} hint={d.suppliers.Rejected ? `${d.suppliers.Rejected} pendaftaran ditolak` : "Setujui atau tolak pendaftaran"} icon="shield" tone={d.suppliers.Pending ? "warning" : "neutral"} />
      </div>

      <Section title="Ringkasan data" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        <StatCard href="/admin/users" label="Manajer Gudang aktif" value={formatNumber(u("warehouse_manager").active)} hint={`${u("warehouse_manager").total} akun total`} icon="user" />
        <StatCard href="/admin/users" label="Staf Gudang aktif" value={formatNumber(u("warehouse_staff").active)} hint={`${u("warehouse_staff").total} akun total`} icon="users" tone="info" />
        <StatCard href="/admin/suppliers" label="Supplier terverifikasi" value={formatNumber(d.suppliers.Approved ?? 0)} icon="building" tone="success" />
        <StatCard href="/admin/products" label="Produk aktif" value={formatNumber(d.master.products)} hint={`${d.master.archived} diarsipkan`} icon="box" />
        <StatCard href="/admin/categories" label="Kategori produk" value={formatNumber(d.master.categories)} icon="tag" tone="info" />
        <StatCard href="/admin/activity" label="Aktivitas hari ini" value={formatNumber(d.master.activity_today)} hint="Lihat di Aktivitas Sistem" icon="history" tone="neutral" />
      </div>

      <Section title="Daftar" />
      
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MiniList title="Supplier menunggu verifikasi" href="/admin/suppliers?status=Pending" empty="Tidak ada pendaftaran yang menunggu." count={d.pendingSuppliers.length}>
          {d.pendingSuppliers.map((s) => <Row key={s.id} href={`/admin/suppliers/${s.id}`} primary={s.company_name} secondary={`${s.full_name} · daftar ${formatDate(s.created_at)}`} right="Tinjau" />)}
        </MiniList>
          <StockDonut stock={d.stock} title="Kondisi stok produk" />
          <MiniList wide title="Aktivitas sistem terbaru" href="/admin/activity" empty="Belum ada aktivitas." count={d.recent.length}>
          {d.recent.map((a, i) => <Row key={i} primary={a.activity} secondary={`${a.full_name ?? "Sistem"}${a.description ? ` · ${a.description}` : ""}`} right={<span className="text-xs text-muted-foreground">{formatRelativeTime(a.created_at)}</span>} />)}
        </MiniList>
      </div>
    </>
  );
}
