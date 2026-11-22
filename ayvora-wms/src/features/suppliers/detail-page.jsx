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
  const isAdmin = can(user, "SUPPLIER_VERIFY");
  const status = supplier.supplier_status;

  return (
    <>
      <PageHeader
        title={supplier.company_name}
        description={supplier.business_field}
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
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profil perusahaan" action={<SupplierBadge status={status} />} />
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Penanggung jawab">{supplier.full_name}</Info>
            <Info label="Email">{supplier.email}</Info>
            <Info label="Telepon">{supplier.phone}</Info>
            <Info label="Website">{supplier.website_url}</Info>
            <Info label="Alamat">{supplier.address}</Info>
            <Info label="Kategori produk">{supplier.categories}</Info>
            <Info label="Terdaftar">{formatDate(supplier.created_at)}</Info>
            <Info label="Total PO / Diterima">{supplier.stats.total_po} / {supplier.stats.received}</Info>
          </dl>
          {supplier.company_description && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{supplier.company_description}</p>}
          {status === "Rejected" && supplier.supplier_review_note && (
            <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-destructive">Alasan penolakan: {supplier.supplier_review_note}</p>
          )}
        </Card>
        <Card>
          <CardHeader title="Rating" description={supplier.avg_rating ? `Rata-rata ${supplier.avg_rating} / 5 dari ${supplier.rating_count} penilaian` : "Belum ada penilaian"} />
          <ul className="space-y-3">
            {supplier.ratings.map((rating) => (
              <li key={rating.po_number} className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="font-medium">{"★".repeat(rating.rating)}{"☆".repeat(5 - rating.rating)} <span className="text-xs text-muted-foreground">{rating.po_number}</span></p>
                {rating.feedback && <p className="mt-1 text-muted-foreground">{rating.feedback}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
