import { notFound } from "next/navigation";
import { approveSupplierAction, rejectSupplierAction } from "@/actions/suppliers";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SupplierBadge } from "@/components/ui/status-badges";
import { isUuid } from "@/lib/action-helpers";
import { requirePermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/format";
import { can, getHomePath } from "@/lib/permissions";
import { markEntityRead } from "@/services/notifications";
import { getSupplier } from "@/services/suppliers";

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children || "-"}</dd>
    </div>
  );
}

export default async function SupplierDetailPage({ params }) {
  const user = await requirePermission("SUPPLIER_VIEW");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  await markEntityRead(user.id, { entityType: "supplier", entityId: id });
  const isAdmin = can(user, "SUPPLIER_VERIFY");
  const status = supplier.supplier_status;

  return (
    <>
      <PageHeader
        title={supplier.company_name}
        actions={
          <>
            <ButtonLink href={`${getHomePath(user.role)}/suppliers`} variant="outline">Kembali</ButtonLink>
            {isAdmin && (status === "Pending" || status === "Rejected") && (
              <ActionDialog triggerLabel="Setujui" triggerVariant="primary" triggerSize="md" title="Setujui supplier ini?" description="Supplier akan dapat masuk dan menerima pesanan restock." action={approveSupplierAction} fields={{ supplierId: supplier.id }} confirmLabel="Setujui" />
            )}
            {isAdmin && status === "Pending" && (
              <ActionDialog triggerLabel="Tolak" triggerVariant="danger" triggerSize="md" title="Tolak pendaftaran supplier?" description="Supplier tidak dapat masuk. Alasan akan dicatat." action={rejectSupplierAction} fields={{ supplierId: supplier.id }} reason={{ label: "Alasan penolakan", required: true, placeholder: "Contoh: dokumen perusahaan belum lengkap" }} confirmLabel="Tolak" confirmVariant="danger" />
            )}
          </>
        }
      />
      <Card>
        <CardHeader title="Profil perusahaan" action={<SupplierBadge status={status} />} />
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Penanggung jawab">{supplier.full_name}</Info>
          <Info label="Email">{supplier.email}</Info>
          <Info label="Telepon">{supplier.phone}</Info>
          <Info label="Website">
            {supplier.website_url ? <a href={supplier.website_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{supplier.website_url}</a> : null}
          </Info>
          <Info label="Bidang usaha">{supplier.business_field}</Info>
          <Info label="Kategori produk">{supplier.categories}</Info>
          <Info label="Alamat">{supplier.address}</Info>
          <Info label="Terdaftar">{formatDate(supplier.created_at)}</Info>
        </dl>
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Deskripsi perusahaan</p>
          <p className="mt-1 whitespace-pre-line text-sm">{supplier.company_description || "-"}</p>
        </div>
        {status === "Rejected" && supplier.supplier_review_note && (
          <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-destructive">Alasan penolakan: {supplier.supplier_review_note}</p>
        )}
      </Card>
    </>
  );
}
