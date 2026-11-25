import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ApprovalBadge, InspectionBadge, ShipmentBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { getHomePath } from "@/lib/permissions";
import { SHIPMENT_STATUS_OPTIONS, listShipments } from "@/services/shipments";

const TABS = [
  { value: "active", label: "Berjalan" },
  { value: "needs-inspection", label: "Perlu diperiksa" },
  { value: "", label: "Semua" },
];

export default async function ShipmentListPage({ searchParams }) {
  const user = await requirePermission("INBOUND_VIEW");
  const BASE = `${getHomePath(user.role)}/shipments`;
  const raw = { ...(await searchParams) };
  if (raw.stage === undefined) raw.stage = "active";
  const { rows, params, info } = await listShipments(raw);
  const lp = linkParams(params);

  return (
    <>
      <PageHeader title="Pengiriman Masuk" />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <ButtonLink key={tab.value} href={buildHref(BASE, {}, { stage: tab.value || "all" })} size="sm" variant={(params.filters.stage || "all") === (tab.value || "all") ? "primary" : "outline"}>{tab.label}</ButtonLink>
        ))}
      </div>
      <FilterBar
        basePath={BASE}
        params={params}
        placeholder="Cari nomor pengiriman, PO, supplier, resi"
        filters={[
          { name: "status", label: "Semua status", options: SHIPMENT_STATUS_OPTIONS.map(([value, label]) => ({ value, label })) },
          { name: "kind", label: "Semua tipe transaksi", options: [{ value: "PO", label: "Pesanan (PO)" }, { value: "Replacement", label: "Barang pengganti" }] },
        ]}
        extra={
          <>
            <input type="hidden" name="stage" value={params.filters.stage || "all"} />
            <input type="date" name="from" defaultValue={params.filters.from} aria-label="Dikirim dari tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
            <input type="date" name="to" defaultValue={params.filters.to} aria-label="Dikirim sampai tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon="truck" title="Tidak ada pengiriman" description="Pengiriman yang sesuai filter akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No. Pengiriman" sortKey="number" basePath={BASE} params={lp} />
                  <Th>PO / Supplier</Th>
                  <SortTh label="Dikirim" sortKey="shipped" basePath={BASE} params={lp} />
                  <Th className="text-right">Jumlah</Th>
                  <SortTh label="Status" sortKey="status" basePath={BASE} params={lp} />
                  <Th>Pemeriksaan</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const needsAssign = user.role === "warehouse_manager" && row.status === "Arrived" && (!row.inspection_id || row.inspection_status === "Not Found");
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <Td className="whitespace-nowrap font-medium">
                        <Link href={`${BASE}/${row.id}`} className="hover:underline">{row.shipment_number}</Link>
                        {row.kind === "Replacement" && <span className="block text-xs font-normal text-muted-foreground">Pengganti {row.claim_number}</span>}
                      </Td>
                      <Td>{row.po_number}<span className="block text-xs text-muted-foreground">{row.supplier_company}</span></Td>
                      <Td className="whitespace-nowrap">{formatDateTime(row.shipped_at)}</Td>
                      <Td className="whitespace-nowrap text-right">{formatNumber(row.total_quantity)}</Td>
                      <Td><ShipmentBadge status={row.status} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {needsAssign ? <Badge tone="danger">Perlu diperintahkan</Badge> : <InspectionBadge status={row.inspection_status} />}
                          <ApprovalBadge status={row.approval_status} />
                        </div>
                        {row.inspector_name && <span className="mt-1 block text-xs text-muted-foreground">{row.inspector_name}</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-right"><ButtonLink href={`${BASE}/${row.id}`} variant={needsAssign ? "primary" : "outline"} size="sm">{needsAssign ? "Perintahkan periksa" : "Detail"}</ButtonLink></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={BASE} params={lp} info={info} />
        </>
      )}
    </>
  );
}
