import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { LateBadge, RestockBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatNumber } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listRestock } from "@/services/restock";

// scope: "all" (manager), "active" (supplier: pesanan berjalan), "history" (supplier: riwayat)
export async function RestockList({ searchParams, scope = "all", path = "restock" }) {
  const user = await requirePermission("RESTOCK_VIEW");
  const home = getHomePath(user.role);
  const base = `${home}/${path}`;
  const { rows, params, info } = await listRestock(user, await searchParams, scope);
  const lp = linkParams(params);
  const isManager = can(user, "RESTOCK_CREATE");
  const exportHref = `/api/export/restock?${new URLSearchParams(Object.entries(lp).filter(([, v]) => v)).toString()}`;
  const statusOptions = (scope === "history" ? ["Received", "Rejected"] : scope === "active" ? ["Pending", "Confirmed", "In Transit"] : ["Pending", "Confirmed", "In Transit", "Received", "Rejected"]).map((v) => ({ value: v, label: v }));

  return (
    <>
      <PageHeader
        title={scope === "history" ? "Riwayat Pesanan" : isManager ? "Restock Order (PO)" : "Pesanan Restock"}
        description={isManager ? "Pesan stok ke supplier dan pantau statusnya." : scope === "history" ? "Pesanan yang sudah selesai atau ditolak." : "Pesanan dari gudang yang perlu Anda tangani."}
        actions={
          <>
            {can(user, "EXPORT_RESTOCK") && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
            {isManager && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Buat PO</ButtonLink>}
          </>
        }
      />
      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nomor PO atau supplier"
        filters={[
          { name: "status", label: "Semua status", options: statusOptions },
          ...(scope !== "history" ? [{ name: "late", label: "Semua waktu", options: [{ value: "1", label: "Hanya terlambat" }] }] : []),
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon="clipboard" title="Belum ada pesanan" description="Pesanan yang sesuai filter akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No. PO" sortKey="po" basePath={base} params={lp} />
                  {isManager && <Th>Supplier</Th>}
                  <SortTh label="Tanggal" sortKey="date" basePath={base} params={lp} />
                  <SortTh label="Estimasi tiba" sortKey="eta" basePath={base} params={lp} />
                  <SortTh label="Jumlah" sortKey="items" basePath={base} params={lp} className="text-right" />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td className="whitespace-nowrap font-medium"><Link href={`${base}/${row.id}`} className="hover:underline">{row.po_number}</Link></Td>
                    {isManager && <Td>{row.supplier_company}</Td>}
                    <Td className="whitespace-nowrap">{formatDate(row.order_date)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(row.expected_delivery_date)}</Td>
                    <Td className="whitespace-nowrap text-right">{row.item_count} produk / {formatNumber(row.total_quantity)} unit</Td>
                    <Td><div className="flex flex-wrap items-center gap-1.5"><RestockBadge status={row.status} />{row.is_late && <LateBadge />}</div></Td>
                    <Td className="text-right"><ButtonLink href={`${base}/${row.id}`} variant="outline" size="sm">Detail</ButtonLink></Td>
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

export default function RestockListPage(props) {
  return <RestockList {...props} scope="all" />;
}
