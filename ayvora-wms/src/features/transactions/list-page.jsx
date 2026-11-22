import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { DeliveryBadge, TransactionBadge } from "@/components/ui/status-badges";
import { EmptyState, SortTh, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/shared/icons";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";
import { linkParams } from "@/lib/list-params";
import { can, getHomePath } from "@/lib/permissions";
import { listTransactions } from "@/services/transactions";

const TYPE_LABEL = { INCOMING: "Masuk", OUTGOING: "Keluar" };
const TABS = [
  { value: "Pending", label: "Menunggu" },
  { value: "Approved", label: "Disetujui" },
  { value: "Shipped", label: "Dikirim" },
  { value: "Rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
];

// type: "INCOMING" | "OUTGOING" (halaman staff) atau null (halaman persetujuan manager, semua tipe)
export async function TransactionList({ searchParams, type = null }) {
  const user = await requirePermission("TRANSACTION_VIEW");
  const raw = { ...(await searchParams) };
  const isManager = can(user, "TRANSACTION_REVIEW");
  // Manager membuka halaman persetujuan dengan tab "Menunggu" secara bawaan.
  if (isManager && raw.status === undefined) raw.status = "Pending";
  const typeFilter = type ?? (["INCOMING", "OUTGOING"].includes(raw.type) ? raw.type : null);

  const { rows, params, info } = await listTransactions(user, raw, typeFilter);
  const home = getHomePath(user.role);
  const path = type ? (type === "INCOMING" ? "incoming" : "outgoing") : "transactions";
  const base = `${home}/${path}`;
  const lp = { ...linkParams(params), ...(isManager && raw.status === "all" ? { status: "all" } : {}), ...(!type && typeFilter ? { type: typeFilter } : {}) };
  const activeStatus = isManager ? raw.status : params.filters.status;
  const exportHref = `/api/export/transactions?${new URLSearchParams(Object.entries({ ...lp, type: typeFilter ?? "" }).filter(([, v]) => v)).toString()}`;
  const staffCanCreate = can(user, "TRANSACTION_CREATE") && type;

  return (
    <>
      <PageHeader
        title={type === "INCOMING" ? "Barang Masuk" : type === "OUTGOING" ? "Barang Keluar" : "Persetujuan Transaksi"}
        description={isManager ? "Tinjau transaksi dari Staff. Stok hanya berubah setelah Anda menyetujui." : "Riwayat transaksi yang Anda buat."}
        actions={
          <>
            {can(user, "EXPORT_TRANSACTIONS") && <ButtonLink href={exportHref} variant="outline" prefetch={false}><Icon name="download" className="size-4" /> Ekspor CSV</ButtonLink>}
            {staffCanCreate && <ButtonLink href={`${base}/new`}><Icon name="plus" className="size-4" /> Catat {type === "INCOMING" ? "Barang Masuk" : "Barang Keluar"}</ButtonLink>}
          </>
        }
      />

      {isManager && (
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <ButtonLink key={tab.value} href={buildHref(base, { ...(typeFilter ? { type: typeFilter } : {}) }, { status: tab.value })} size="sm" variant={activeStatus === tab.value ? "primary" : "outline"}>{tab.label}</ButtonLink>
          ))}
          <span className="mx-1 hidden w-px bg-border sm:block" />
          {[["", "Semua tipe"], ["INCOMING", "Masuk"], ["OUTGOING", "Keluar"]].map(([value, label]) => (
            <ButtonLink key={value} href={buildHref(base, { status: raw.status }, { type: value })} size="sm" variant={(typeFilter ?? "") === value ? "primary" : "outline"}>{label}</ButtonLink>
          ))}
        </div>
      )}

      <FilterBar
        basePath={base}
        params={params}
        placeholder="Cari nomor, supplier, pelanggan, atau PO"
        filters={isManager ? [] : [{ name: "status", label: "Semua status", options: ["Pending", "Approved", "Rejected", "Shipped"].map((v) => ({ value: v, label: v })) }]}
        extra={
          <>
            {isManager && <input type="hidden" name="status" value={raw.status} />}
            {isManager && typeFilter && !type && <input type="hidden" name="type" value={typeFilter} />}
            <input type="date" name="from" defaultValue={params.filters.from} aria-label="Dari tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
            <input type="date" name="to" defaultValue={params.filters.to} aria-label="Sampai tanggal" className="h-11 rounded-xl border border-field-border bg-card px-3 text-sm" />
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon="inbox" title="Tidak ada transaksi" description="Transaksi yang sesuai filter akan tampil di sini." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <SortTh label="No. Transaksi" sortKey="number" basePath={base} params={lp} />
                  {!type && <Th>Tipe</Th>}
                  <SortTh label="Tanggal" sortKey="date" basePath={base} params={lp} />
                  <Th>Pihak terkait</Th>
                  <SortTh label="Jumlah" sortKey="qty" basePath={base} params={lp} className="text-right" />
                  <SortTh label="Status" sortKey="status" basePath={base} params={lp} />
                  {isManager && <Th>Dibuat oleh</Th>}
                  <Th className="text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const detailHref = isManager ? `${base}/${row.id}` : `${home}/${row.type === "INCOMING" ? "incoming" : "outgoing"}/${row.id}`;
                  return (
                    <tr key={row.id} className="hover:bg-muted/40">
                      <Td className="whitespace-nowrap font-medium"><Link href={detailHref} className="hover:underline">{row.transaction_number}</Link></Td>
                      {!type && <Td>{TYPE_LABEL[row.type]}</Td>}
                      <Td className="whitespace-nowrap">{formatDate(row.transaction_date)}</Td>
                      <Td>{row.type === "INCOMING" ? row.supplier_company : row.customer_name}{row.po_number && <span className="block text-xs text-muted-foreground">{row.po_number}</span>}</Td>
                      <Td className="whitespace-nowrap text-right">{formatNumber(row.total_quantity)}{row.total_damaged > 0 && <span className="block text-xs text-destructive">{row.total_damaged} rusak</span>}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <TransactionBadge status={row.status} />
                          {row.has_mismatch && <Badge tone="warning">Selisih</Badge>}
                          {row.delivery_status && row.status !== "Pending" && <DeliveryBadge status={row.delivery_status} />}
                        </div>
                      </Td>
                      {isManager && <Td>{row.created_by_name}</Td>}
                      <Td className="text-right"><ButtonLink href={detailHref} variant="outline" size="sm">{isManager && row.status === "Pending" ? "Tinjau" : "Detail"}</ButtonLink></Td>
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

export default async function TransactionListPage(props) {
  return TransactionList(props);
}
