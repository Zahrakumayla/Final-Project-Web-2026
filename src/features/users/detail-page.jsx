import { notFound } from "next/navigation";
import { activateUserAction, deactivateUserAction } from "@/actions/users";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Info } from "@/components/ui/detail";
import { PageHeader } from "@/components/ui/page-header";
import { ActiveBadge, SupplierBadge } from "@/components/ui/status-badges";
import { ResetPasswordForm } from "@/features/users/forms";
import { isUuid } from "@/lib/action-helpers";
import { ROLE_LABELS } from "@/lib/auth/config";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { getUser } from "@/services/users";

export default async function UserDetailPage({ params }) {
  const admin = await requirePermission("USER_MANAGE");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getUser(id);
  if (!user) notFound();
  const self = user.id === admin.id;
  const manageable = ["warehouse_manager", "warehouse_staff"].includes(user.role);

  return (
    <>
      <PageHeader
        title={user.full_name}
        description={`${ROLE_LABELS[user.role]}${user.company_name ? ` · ${user.company_name}` : ""}`}
        actions={
          <>
            <ButtonLink href="/admin/users" variant="outline">Kembali</ButtonLink>
            {!self && user.role !== "admin" && (user.is_active ? (
              <ActionDialog triggerLabel="Nonaktifkan" triggerVariant="danger" triggerSize="md" title="Nonaktifkan akun ini?" description={user.role === "supplier" ? "Supplier kehilangan akses. PO yang berjalan tetap tercatat dan Manager diberi tahu." : "Pengguna tidak bisa login dan semua sesinya dicabut."} action={deactivateUserAction} fields={{ userId: user.id }} confirmLabel="Nonaktifkan" confirmVariant="danger" />
            ) : (
              <ActionDialog triggerLabel="Aktifkan" triggerVariant="primary" triggerSize="md" title="Aktifkan kembali akun ini?" action={activateUserAction} fields={{ userId: user.id }} confirmLabel="Aktifkan" />
            ))}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Informasi akun" action={<div className="flex gap-1.5"><ActiveBadge active={user.is_active} />{user.supplier_status && <SupplierBadge status={user.supplier_status} />}</div>} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Email">{user.email}</Info>
              <Info label="Telepon">{user.phone}</Info>
              <Info label="Role">{ROLE_LABELS[user.role]}</Info>
              <Info label="Dibuat">{formatDateTime(user.created_at)}</Info>
              <Info label="Login terakhir">{user.last_login ? formatDateTime(user.last_login) : null}</Info>
            </dl>
          </Card>
          {manageable && <ResetPasswordForm userId={user.id} />}
        </div>
        <Card>
          <CardHeader title="Aktivitas terakhir" />
          {user.activity.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p> : (
            <ul className="space-y-3 text-sm">
              {user.activity.map((a, i) => (
                <li key={i}><p className="font-medium">{a.activity}</p>{a.description && <p className="text-muted-foreground">{a.description}</p>}<p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
