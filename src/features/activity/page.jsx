import { idText } from "@/lib/labels";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ENTITY_LABEL, listActivity } from "@/services/activity";

// Admin: seluruh aktivitas sistem. Manager & Staff: aktivitas operasional gudang.
export default async function ActivityPage({ searchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const all = can(user, "ACTIVITY_VIEW_ALL");
  if (!all && !can(user, "ACTIVITY_VIEW_WAREHOUSE")) redirect(getHomePath(user.role));
  const { rows, params, info, entities } = await listActivity(await searchParams, all ? "all" : "warehouse");
  const base = `${getHomePath(user.role)}/activity`;
  const lp = linkParams(params);

  return (
    <>
      <PageHeader title={all ? "Aktivitas Sistem" : "Aktivitas Gudang"} />
      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari aktivitas, keterangan, atau nama"
        filters={[
          { name: "entity", label: "Semua modul", options: entities.map((e) => ({ value: e, label: ENTITY_LABEL[e] })) },
          { name: "role", label: "Semua role", options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
        ]}
        extra={
          <>
            <input type="date" name="from" defaultValue={params.filters.from} aria-label="Dari tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
            <input type="date" name="to" defaultValue={params.filters.to} aria-label="Sampai tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon="history" title="Belum ada aktivitas" />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead><tr><SortTh label="Waktu" sortKey="created" basePath={base} params={lp} /><SortTh label="Pengguna" sortKey="user" basePath={base} params={lp} /><SortTh label="Aktivitas" sortKey="activity" basePath={base} params={lp} /><Th>Modul</Th><Th>Keterangan</Th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(row.created_at)}</Td>
                    <Td>{row.full_name ?? "Sistem"}{row.role && <span className="block text-xs text-muted-foreground">{ROLE_LABELS[row.role]}</span>}</Td>
                    <Td className="font-medium">{idText(row.activity)}</Td>
                    <Td>{ENTITY_LABEL[row.entity_type] ?? "-"}</Td>
                    <Td className="max-w-md">{idText(row.description) ?? "-"}</Td>
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
