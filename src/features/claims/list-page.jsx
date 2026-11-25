import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ClaimBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";
import { CLAIM_TYPE_LABEL, statusOptions } from "@/lib/labels";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { CLAIM_STATUSES, CLAIM_TYPES, listClaims } from "@/services/claims";
import { listProblemInspections } from "@/services/inspections";

// Perlu tindakan dari sisi pengguna yang sedang melihat
function needsAction(row, isManager) {
  if (isManager) return (row.status === "Claim Submitted" && !row.requested_resolution) || (row.status === "Refund Processing" && !row.refund_proof_invalid);
  return (row.status === "Claim Submitted" && Boolean(row.requested_resolution)) || (row.status === "Refund Processing" && row.refund_proof_invalid);
}

export default async function ClaimListPage({ searchParams }) {
  const user = await requirePermission("CLAIM_VIEW");
  const isManager = can(user, "CLAIM_DECIDE");
  const monitor = isManager || user.role === "admin";
  const raw = { ...(await searchParams) };
  if (raw.status === undefined) raw.status = "open";
  const { rows, params, info } = await listClaims(user, raw);
  const base = `${getHomePath(user.role)}/claims`;
  const lp = linkParams(params);
  const pendingProblems = isManager ? await listProblemInspections() : [];

  return (
    <>
      <PageHeader
        title="Klaim Barang Bermasalah"
        description={isManager ? "Barang kurang, rusak, atau salah dari supplier. Klaim terbentuk saat Anda menyetujui laporan pemeriksaan, lalu supplier menindaklanjuti." : "Barang kurang, rusak, atau salah dari supplier."}
      />
      {pendingProblems.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning-soft p-4">
          <p className="mb-2 text-sm font-semibold text-warning">{pendingProblems.length} laporan pemeriksaan memuat barang bermasalah dan menunggu keputusan Anda</p>
          <ul className="space-y-2 text-sm">
            {pendingProblems.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-medium">{p.inspection_number}</span> · {p.po_number} · {p.supplier_company} · {p.item_problems + p.mismatch_problems} temuan</span>
                <ButtonLink href={`${getHomePath(user.role)}/inspections/${p.id}#tindakan-klaim`} size="sm">Tinjau & ajukan klaim</ButtonLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {[["open", "Sedang berjalan"], ["Resolved", "Selesai"], ["Claim Rejected", "Ditolak"], ["all", "Semua"]].map(([value, label]) => (
          <ButtonLink key={value} href={buildHref(base, {}, { status: value })} size="sm" variant={(params.filters.status || "all") === value ? "primary" : "outline"}>{label}</ButtonLink>
        ))}
      </div>
      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nomor klaim, PO, produk"
        filters={[
          { name: "status", label: "Semua status", options: statusOptions(CLAIM_STATUSES) },
          { name: "type", label: "Semua jenis", options: CLAIM_TYPES.map((v) => ({ value: v, label: CLAIM_TYPE_LABEL[v] })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon="alert" title="Tidak ada klaim" description="Klaim yang sesuai filter akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="Klaim" sortKey="number" basePath={base} params={lp} />
                  <SortTh label="Masalah" sortKey="type" basePath={base} params={lp} />
                  {monitor && <Th>Supplier</Th>}
                  <Th className="text-right">Sisa / total</Th>
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  <SortTh label="Dibuat" sortKey="created" basePath={base} params={lp} />
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const action = needsAction(row, isManager);
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <Td className="whitespace-nowrap"><Link href={`${base}/${row.id}`} className="font-medium hover:underline">{row.claim_number}</Link><span className="block text-xs text-muted-foreground">{row.po_number}</span></Td>
                      <Td><span className="font-medium">{CLAIM_TYPE_LABEL[row.claim_type]}</span><span className="block text-xs text-muted-foreground">{row.product_name}</span></Td>
                      {monitor && <Td className="max-w-40">{row.supplier_company}</Td>}
                      <Td className="whitespace-nowrap text-right">{formatNumber(row.remaining_quantity)}{row.remaining_quantity !== row.quantity && <span className="text-muted-foreground"> / {formatNumber(row.quantity)}</span>}</Td>
                      <Td><div className="flex flex-wrap gap-1.5"><ClaimBadge status={row.status} />{row.status === "Claim Submitted" && <Badge tone={row.requested_resolution ? "info" : "warning"}>{row.requested_resolution === "Refund" ? "Diminta: refund" : row.requested_resolution === "Replacement" ? "Diminta: pengganti" : isManager ? "Menunggu keputusan Anda" : "Menunggu keputusan Manager"}</Badge>}{row.refund_proof_invalid && row.status === "Refund Processing" && <Badge tone="danger">Bukti ditolak</Badge>}</div></Td>
                      <Td className="whitespace-nowrap">{formatDate(row.created_at)}</Td>
                      <Td className="whitespace-nowrap text-right"><ButtonLink href={`${base}/${row.id}`} size="sm" variant={action ? "primary" : "outline"}>{action ? (isManager ? (row.status === "Refund Processing" ? "Periksa" : "Putuskan") : "Tangani") : "Detail"}</ButtonLink></Td>
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
