import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ActiveBadge, SupplierBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Icon } from "@/components/shared/icons";
import { ROLE_LABELS } from "@/lib/auth/config";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { listUsers } from "@/services/users";

const BASE = "/admin/users";

export default async function UserListPage({ searchParams }) {
  await requirePermission("USER_MANAGE");
  const { rows, params, info } = await listUsers(await searchParams);
  const lp = linkParams(params);
  return (
    <>
      <PageHeader
        title="Pengguna"
        actions={<ButtonLink href={`${BASE}/new`}><Icon name="plus" className="size-4" /> Tambah Pengguna</ButtonLink>}
      />
      <FilterBar
        basePath={BASE}
        params={params}
        placeholder="Cari nama, email, perusahaan"
        filters={[
          { name: "role", label: "Semua role", options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
          { name: "active", label: "Semua status", options: [{ value: "1", label: "Aktif" }, { value: "0", label: "Nonaktif" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon="users" title="Tidak ada pengguna" />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="Nama" sortKey="name" basePath={BASE} params={lp} />
                  <SortTh label="Email" sortKey="email" basePath={BASE} params={lp} />
                  <SortTh label="Role" sortKey="role" basePath={BASE} params={lp} />
                  <Th>Status</Th>
                  <Th>Login terakhir</Th>
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <Td className="font-medium"><Link href={`${BASE}/${row.id}`} className="hover:underline">{row.full_name}</Link>{row.company_name && <span className="block text-xs font-normal text-muted-foreground">{row.company_name}</span>}</Td>
                    <Td>{row.email}</Td>
                    <Td>{ROLE_LABELS[row.role]}</Td>
                    <Td><div className="flex flex-wrap gap-1.5"><ActiveBadge active={row.is_active} />{row.supplier_status && <SupplierBadge status={row.supplier_status} />}</div></Td>
                    <Td className="whitespace-nowrap">{row.last_login ? formatDateTime(row.last_login) : "-"}</Td>
                    <Td className="whitespace-nowrap text-right"><ButtonLink href={`${BASE}/${row.id}`} variant="outline" size="sm">Kelola</ButtonLink></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination basePath={BASE} params={lp} info={info} />
        </>
      )}
    </>
  );
}
