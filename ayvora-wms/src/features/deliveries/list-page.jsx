import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { DeliveryBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatNumber } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { SHIPMENT_STATUSES } from "@/lib/validation/shipment";
import { listShipments } from "@/services/shipments";

export default async function DeliveryListPage({ searchParams }) {
  const user = await requirePermission("SHIPMENT_VIEW");
  const base = `${getHomePath(user.role)}/deliveries`;
  const { rows, params, info } = await listShipments(await searchParams);
  const lp = linkParams(params);
  const manage = can(user, "SHIPMENT_MANAGE");

  return (
    <>
      <PageHeader title={manage ? "Pengiriman" : "Monitoring Pengiriman"} description={manage ? "Proses pengiriman untuk transaksi barang keluar yang sudah disetujui." : "Pantau status pengiriman barang keluar."} />
      <FilterBar basePath={base} params={params} placeholder="Cari nomor, pelanggan, kurir, atau resi" filters={[{ name: "status", label: "Semua status", options: SHIPMENT_STATUSES.map((v) => ({ value: v, label: v })) }]} />
      {rows.length === 0 ? (
        <EmptyState icon="truck" title="Belum ada pengiriman" description="Pengiriman dibuat otomatis saat transaksi barang keluar disetujui." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="Transaksi" sortKey="number" basePath={base} params={lp} />
                  <Th>Tujuan</Th>
                  <Th className="text-right">Jumlah</Th>
                  <Th>Kurir / resi</Th>
                  <SortTh label="Estimasi tiba" sortKey="eta" basePath={base} params={lp} />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td className="whitespace-nowrap font-medium"><Link href={`${base}/${row.id}`} className="hover:underline">{row.transaction_number}</Link></Td>
                    <Td>{row.customer_name}</Td>
                    <Td className="text-right">{formatNumber(row.total_quantity)}</Td>
                    <Td>{row.courier_name ?? "-"}{row.tracking_number && <span className="block text-xs text-muted-foreground">{row.tracking_number}</span>}</Td>
                    <Td className="whitespace-nowrap">{formatDate(row.estimated_arrival_date)}</Td>
                    <Td><DeliveryBadge status={row.delivery_status} /></Td>
                    <Td className="text-right"><ButtonLink href={`${base}/${row.id}`} variant="outline" size="sm">{manage ? "Proses" : "Detail"}</ButtonLink></Td>
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
