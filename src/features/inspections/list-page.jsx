import { statusOptions } from "@/lib/labels";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ApprovalBadge, InspectionBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { APPROVAL_STATUSES, INSPECTION_STATUSES, listInspections } from "@/services/inspections";

export default async function InspectionListPage({ searchParams }) {
  const user = await requirePermission("INSPECTION_VIEW");
  const isManager = can(user, "INSPECTION_APPROVE");
  const monitor = isManager || user.role === "admin";
  const isStaff = user.role === "warehouse_staff";
  const raw = { ...(await searchParams) };
  // Bawaan: Manager melihat yang menunggu persetujuan, Staff melihat tugas yang masih terbuka
  if (raw.status === undefined && raw.approval === undefined) {
    if (isManager) raw.approval = "Awaiting Approval";
    else raw.status = "open";
  }
  const { rows, params, info } = await listInspections(user, raw);
  const base = `${getHomePath(user.role)}/inspections`;
  const lp = linkParams(params);
  const tabs = monitor
    ? [{ label: "Menunggu persetujuan", q: { approval: "Awaiting Approval" } }, { label: "Sedang berjalan", q: { status: "open" } }, { label: "Revisi diminta", q: { approval: "Revision Requested" } }, { label: "Semua", q: { status: "all" } }]
    : [{ label: "Tugas aktif", q: { status: "open" } }, { label: "Revisi diminta", q: { approval: "Revision Requested" } }, { label: "Menunggu persetujuan", q: { approval: "Awaiting Approval" } }, { label: "Semua", q: { status: "all" } }];
  const isActive = (q) => (q.approval ? params.filters.approval === q.approval : !params.filters.approval && (params.filters.status || "all") === q.status);

  return (
    <>
      <PageHeader
        title={isManager ? "Pemeriksaan Barang Masuk" : "Tugas Pemeriksaan"}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => <ButtonLink key={tab.label} href={buildHref(base, {}, tab.q)} size="sm" variant={isActive(tab.q) ? "primary" : "outline"}>{tab.label}</ButtonLink>)}
      </div>
      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nomor pemeriksaan, PO, supplier"
        filters={[
          { name: "status", label: "Semua status", options: statusOptions(INSPECTION_STATUSES) },
          { name: "approval", label: "Semua persetujuan", options: statusOptions(APPROVAL_STATUSES) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon="check" title="Tidak ada pemeriksaan" />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No. Pemeriksaan" sortKey="number" basePath={base} params={lp} />
                  <Th>PO / Supplier</Th>
                  {monitor && <Th>Staff</Th>}
                  <SortTh label="Diperintahkan" sortKey="created" basePath={base} params={lp} />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td className="whitespace-nowrap font-medium">
                      <Link href={`${base}/${row.id}`} className="hover:underline">{row.inspection_number}</Link>
                      <span className="block text-xs font-normal text-muted-foreground">{row.kind === "PO" ? row.shipment_number : `Pengganti ${row.claim_number}`}</span>
                    </Td>
                    <Td>{row.po_number}<span className="block text-xs text-muted-foreground">{row.supplier_company}</span></Td>
                    {monitor && <Td>{row.inspector_name}</Td>}
                    <Td className="whitespace-nowrap">{formatDateTime(row.created_at)}</Td>
                    <Td><div className="flex flex-wrap gap-1.5"><InspectionBadge status={row.status} /><ApprovalBadge status={row.approval_status} /></div></Td>
                    <Td className="text-right">
                      <ButtonLink href={`${base}/${row.id}`} size="sm" variant={(isManager && row.approval_status === "Awaiting Approval") || (isStaff && ["Awaiting Inspection", "Under Inspection"].includes(row.status)) ? "primary" : "outline"}>
                        {isManager && row.approval_status === "Awaiting Approval" ? "Tinjau" : isStaff && row.status === "Awaiting Inspection" ? "Mulai" : isStaff && row.status === "Under Inspection" ? "Lanjutkan" : "Detail"}
                      </ButtonLink>
                    </Td>
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
