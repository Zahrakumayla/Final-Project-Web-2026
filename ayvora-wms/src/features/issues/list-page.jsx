import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { IssueBadge, RemedyBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listIssues } from "@/services/issues";

const TYPES = ["Lost in Transit", "Late Delivery", "Quantity Mismatch", "Damaged Goods", "Outbound Issue"];

export default async function IssueListPage({ searchParams }) {
  const user = await requirePermission("ISSUE_VIEW");
  const base = `${getHomePath(user.role)}/issues`;
  const { rows, params, info } = await listIssues(user, await searchParams);
  const lp = linkParams(params);
  const isManager = can(user, "ISSUE_RESOLVE");

  return (
    <>
      <PageHeader
        title="Laporan Masalah"
        description={isManager ? "Tindak lanjuti laporan dari Staff dan Supplier." : "Laporkan barang hilang, terlambat, tidak sesuai, atau rusak."}
        actions={can(user, "ISSUE_CREATE") && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Buat Laporan</ButtonLink>}
      />
      <FilterBar basePath={base} params={params} placeholder="Cari nomor, deskripsi, PO, atau transaksi" filters={[
        { name: "status", label: "Semua status", options: ["Open", "Under Review", "Resolved", "Dismissed"].map((v) => ({ value: v, label: v })) },
        { name: "type", label: "Semua jenis", options: TYPES.map((v) => ({ value: v, label: v })) },
      ]} />
      {rows.length === 0 ? (
        <EmptyState icon="alert" title="Belum ada laporan" description="Laporan masalah akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No. Laporan" sortKey="number" basePath={base} params={lp} />
                  <SortTh label="Jenis" sortKey="type" basePath={base} params={lp} />
                  <Th>Acuan</Th>
                  {isManager && <Th>Pelapor</Th>}
                  <SortTh label="Tanggal" sortKey="date" basePath={base} params={lp} />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td className="whitespace-nowrap font-medium"><Link href={`${base}/${row.id}`} className="hover:underline">{row.issue_number}</Link></Td>
                    <Td>{row.issue_type}</Td>
                    <Td className="whitespace-nowrap">{row.po_number ?? row.transaction_number}</Td>
                    {isManager && <Td>{row.reporter_company ?? row.reporter_name}</Td>}
                    <Td className="whitespace-nowrap">{formatDate(row.created_at)}</Td>
                    <Td><div className="flex flex-wrap items-center gap-1.5"><IssueBadge status={row.status} />{row.remedy && <RemedyBadge status={row.remedy_status} label={row.remedy === "Refund" ? "Refund" : "Pengganti"} />}</div></Td>
                    <Td className="text-right"><ButtonLink href={`${base}/${row.id}`} variant="outline" size="sm">{isManager && row.status === "Open" ? "Tinjau" : "Detail"}</ButtonLink></Td>
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
