import { PageHeader } from "@/components/ui/page-header";
import { IssueForm } from "@/features/issues/issue-forms";
import { requirePermission } from "@/lib/auth/guards";
import { getHomePath } from "@/lib/permissions";
import { ISSUE_TYPES_BY_ROLE } from "@/lib/validation/issue";
import { listIssueProducts, listReferences } from "@/services/issues";

export default async function NewIssuePage({ searchParams }) {
  const user = await requirePermission("ISSUE_CREATE");
  const { transactionId, restockId } = (await searchParams) ?? {};
  const [references, products] = await Promise.all([listReferences(user), listIssueProducts()]);
  return (
    <>
      <PageHeader title="Buat Laporan Masalah" description="Laporan akan dikirim ke Warehouse Manager." />
      <div className="max-w-3xl">
        <IssueForm types={ISSUE_TYPES_BY_ROLE[user.role]} references={references} products={products} presetReference={transactionId ?? restockId} cancelHref={`${getHomePath(user.role)}/issues`} />
      </div>
    </>
  );
}
