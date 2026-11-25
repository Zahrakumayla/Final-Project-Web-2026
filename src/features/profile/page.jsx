import { PageHeader } from "@/components/ui/page-header";
import { PasswordForm, ProfileForm } from "@/features/profile/forms";
import { requirePermission } from "@/lib/auth/guards";
import { getProfile } from "@/services/profile";

export default async function ProfilePage() {
  const user = await requirePermission("PROFILE_EDIT");
  const profile = await getProfile(user.id);
  return (
    <>
      <PageHeader title="Profil Saya" />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[3fr_2fr]">
        <ProfileForm profile={profile} />
        <div className="h-fit"><PasswordForm /></div>
      </div>
    </>
  );
}
