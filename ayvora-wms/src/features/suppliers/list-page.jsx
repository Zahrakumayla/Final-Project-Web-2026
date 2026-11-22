import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SupplierBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listSuppliers } from "@/services/suppliers";

export default async function SupplierListPage({ searchParams }) {
  const user = await requirePermission("SUPPLIER_VIEW");
  const base = `${getHomePath(user.role)}/suppliers`;
  const { rows, params, info } = await listSuppliers(await searchParams);
  const lp = linkParams(params);
  const isAdmin = can(user, "SUPPLIER_VERIFY");
  const exportHref = `/api/export/suppliers?${new URLSearchParams(Object.entries(lp).filter(([, v]) => v)).toString()}`;

  return (
    <>
      <PageHeader
        title={isAdmin ? "Verifikasi Supplier" : "Supplier"}
        description={isAdmin ? "Setujui atau tolak pendaftaran supplier. Supplier hanya bisa masuk setelah disetujui." : "Daftar supplier beserta rating dari restock yang sudah diterima."}
        actions={can(user, "EXPORT_SUPPLIERS") && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
      />
      <FilterBar basePath={base} params={params} placeholder="Cari perusahaan, nama, atau email" filters={[{ name: "status", label: "Semua status", options: ["Pending", "Approved", "Rejected"].map((value) => ({ value, label: value })) }]} />
      {rows.length === 0 ? (
        <EmptyState icon="users" title="Supplier tidak ditemukan" />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="Perusahaan" sortKey="company" basePath={base} params={lp} />
                  <Th>Kontak</Th>
                  <Th>Kategori</Th>
                  <SortTh label="Rating" sortKey="rating" basePath={base} params={lp} />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <SortTh label="Daftar" sortKey="date" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td><Link href={`${base}/${row.id}`} className="font-medium hover:underline">{row.company_name}</Link></Td>
                    <Td><span className="block">{row.full_name}</span><span className="text-xs text-muted-foreground">{row.email}</span></Td>
                    <Td className="max-w-56 text-muted-foreground">{row.categories}</Td>
                    <Td className="whitespace-nowrap">{row.avg_rating ? `${row.avg_rating} / 5 (${row.rating_count})` : "-"}</Td>
                    <Td><SupplierBadge status={row.supplier_status} /></Td>
                    <Td className="whitespace-nowrap">{formatDate(row.created_at)}</Td>
                    <Td className="text-right"><ButtonLink href={`${base}/${row.id}`} variant="outline" size="sm">{isAdmin && row.supplier_status === "Pending" ? "Tinjau" : "Detail"}</ButtonLink></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={base} params={lp} info={info} />
        </>
      )}
    </>
  );
}
