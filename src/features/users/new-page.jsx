import { PageHeader } from "@/components/ui/page-header";
import { UserForm } from "@/features/users/forms";
import { requirePermission } from "@/lib/auth/guards";

export default async function NewUserPage() {
  await requirePermission("USER_MANAGE");
  return (
    <>
      <PageHeader title="Tambah Pengguna" />
      <div className="max-w-2xl"><UserForm /></div>
    </>
  );
}
