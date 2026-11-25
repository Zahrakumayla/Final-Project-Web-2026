import { statusOptions } from "@/lib/labels";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { OutboundBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { OUTBOUND_STATUSES, OUTBOUND_TYPES, listOutbound } from "@/services/outbound";

export default async function OutboundListPage({ searchParams }) {
  const user = await requirePermission("OUTBOUND_VIEW");
  const isManager = can(user, "OUTBOUND_DECIDE");
  const isStaff = can(user, "OUTBOUND_CREATE");
  const raw = { ...(await searchParams) };
  if (raw.status === undefined) raw.status = isManager ? "Pending Approval" : "active";
  const { rows, params, info } = await listOutbound(raw);
  const base = `${getHomePath(user.role)}/outgoing`;
  const lp = linkParams(params);
  const exportHref = `/api/export/outbound?${new URLSearchParams(Object.entries(lp).filter(([, v]) => v)).toString()}`;
  const tabs = isManager
    ? [["Pending Approval", "Menunggu persetujuan"], ["active", "Berjalan"], ["Shipped", "Terkirim"], ["all", "Semua"]]
    : [["active", "Berjalan"], ["Rejected", "Ditolak"], ["Shipped", "Terkirim"], ["all", "Semua"]];

  const actionLabel = (row) => {
    if (isManager && row.status === "Pending Approval") return "Tinjau";
    if (isStaff && row.status === "Rejected") return "Perbaiki";
    if (isStaff && row.status === "Approved") return "Siapkan";
    if (isStaff && row.status === "Preparing") return "Kirim";
    return null;
  };

  return (
    <>
      <PageHeader
        title="Barang Keluar"
        actions={
          <>
            {can(user, "EXPORT_OUTBOUND") && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
            {isStaff && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Buat Laporan</ButtonLink>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <ButtonLink key={value} href={buildHref(base, {}, { status: value })} size="sm" variant={(params.filters.status || "all") === value ? "primary" : "outline"}>{label}</ButtonLink>
        ))}
      </div>
      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nomor, pelanggan, alamat"
        filters={[
          { name: "status", label: "Semua status", options: statusOptions(OUTBOUND_STATUSES) },
          { name: "type", label: "Semua tipe transaksi", options: OUTBOUND_TYPES.map(([value, label]) => ({ value, label })) },
        ]}
        extra={
          <>
            <input type="date" name="from" defaultValue={params.filters.from} aria-label="Dari tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
            <input type="date" name="to" defaultValue={params.filters.to} aria-label="Sampai tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon="send" title="Tidak ada laporan" description="Laporan barang keluar yang sesuai filter akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No." sortKey="number" basePath={base} params={lp} />
                  <SortTh label="Pelanggan" sortKey="customer" basePath={base} params={lp} />
                  <Th className="text-right">Diminta / disetujui / dikirim</Th>
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <SortTh label="Dibuat" sortKey="created" basePath={base} params={lp} />
                  <Th>Dikirim</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const label = actionLabel(row);
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <Td className="whitespace-nowrap font-medium"><Link href={`${base}/${row.id}`} className="hover:underline">{row.order_number}</Link></Td>
                      <Td>{row.customer_name}<span className="block max-w-xs truncate text-xs text-muted-foreground">{row.destination_address}</span></Td>
                      <Td className="whitespace-nowrap text-right">{formatNumber(row.total_requested)} / {row.total_approved ?? "-"} / {row.total_shipped ?? "-"}</Td>
                      <Td><OutboundBadge status={row.status} />{row.submission_count > 1 && <span className="mt-1 block text-xs text-muted-foreground">Pengajuan ke-{row.submission_count}</span>}</Td>
                      <Td className="whitespace-nowrap">{formatDateTime(row.created_at)}<span className="block text-xs text-muted-foreground">{row.created_by_name}</span></Td>
                      <Td className="whitespace-nowrap">{row.shipped_at ? formatDateTime(row.shipped_at) : <span className="text-muted-foreground">-</span>}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <ButtonLink href={`${base}/${row.id}`} size="sm" variant={label ? "primary" : "outline"}>{label ?? "Detail"}</ButtonLink>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={base} params={lp} info={info} />
        </>
      )}
    </>
  );
}
