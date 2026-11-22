import { notFound } from "next/navigation";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { IssueBadge, RemedyBadge } from "@/components/ui/status-badges";
import { RemedyCompleteForm, RemedyRequestForm, RemedyRespondForm, ResolveForm } from "@/features/issues/issue-forms";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate, formatDateTime, formatNumber, formatRupiah } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { REMEDY_ISSUE_TYPES } from "@/lib/validation/issue";
import { getIssue, listReplacementCandidates } from "@/services/issues";

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "-"}</dd>
    </div>
  );
}

export default async function IssueDetailPage({ params }) {
  const user = await requirePermission("ISSUE_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const issue = await getIssue(user, id);
  if (!issue) notFound();
  const open = ["Open", "Under Review"].includes(issue.status);
  const isManager = can(user, "ISSUE_RESOLVE");
  const canRequest = isManager && open && !issue.remedy && REMEDY_ISSUE_TYPES.includes(issue.issue_type);
  const canRespond = can(user, "ISSUE_REMEDY_RESPOND") && issue.remedy_supplier_id === user.id && issue.remedy_status === "Requested";
  const canComplete = isManager && issue.remedy_status === "In Progress";
  const candidates = canComplete && issue.remedy === "Replacement" ? await listReplacementCandidates(issue.remedy_supplier_id) : [];

  return (
    <>
      <PageHeader title={issue.issue_number} description={issue.issue_type} actions={<ButtonLink href={`${getHomePath(user.role)}/issues`} variant="outline">Kembali</ButtonLink>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Rincian" action={<IssueBadge status={issue.status} />} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Pelapor">{issue.reporter_company ?? issue.reporter_name}</Info>
              <Info label="Dilaporkan">{formatDateTime(issue.created_at)}</Info>
              <Info label="Nomor PO">{issue.po_number}</Info>
              <Info label="Transaksi">{issue.transaction_number}</Info>
            </dl>
            <p className="mt-4 border-t border-border pt-4 text-sm">{issue.description}</p>
            {issue.items.length > 0 && (
              <ul className="mt-3 text-sm text-muted-foreground">
                {issue.items.map((item) => <li key={item.sku}>{item.name} ({item.sku}): {formatNumber(item.quantity)} {item.unit}</li>)}
              </ul>
            )}
            {issue.evidence_url && (
              <div className="relative mt-4 aspect-video w-full max-w-md overflow-hidden rounded-xl bg-muted">
                <Image src={issue.evidence_url} alt="Bukti laporan" fill unoptimized className="object-contain" />
              </div>
            )}
          </Card>
          {issue.remedy && (
            <Card>
              <CardHeader title={issue.remedy === "Replacement" ? "Barang pengganti" : "Refund"} action={<RemedyBadge status={issue.remedy_status} />} />
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Supplier">{issue.remedy_supplier_name}</Info>
                {issue.remedy === "Refund" && <Info label="Nominal">{formatRupiah(issue.refund_amount)}</Info>}
                {issue.remedy_responded_at && <Info label={issue.remedy === "Refund" ? "Referensi refund" : "Resi / keterangan"}>{issue.remedy_note}</Info>}
                {issue.remedy_eta && <Info label="Estimasi tiba">{formatDate(issue.remedy_eta)}</Info>}
                {issue.replacement_number && <Info label="Dicatat di transaksi">{issue.replacement_number}</Info>}
              </dl>
            </Card>
          )}
          {issue.resolution_note && (
            <Card>
              <CardHeader title="Penyelesaian" description={`${issue.resolver_name ?? "-"} · ${formatDate(issue.resolved_at)}`} />
              <p className="text-sm">{issue.resolution_note}</p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {canRequest && <RemedyRequestForm issue={issue} />}
          {canRespond && <RemedyRespondForm issue={issue} />}
          {canComplete && <RemedyCompleteForm issue={issue} candidates={candidates} />}
          {isManager && open && !issue.remedy && <ResolveForm issue={issue} />}
        </div>
      </div>
    </>
  );
}
