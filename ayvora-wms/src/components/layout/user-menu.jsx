import { logoutAction } from "@/actions/auth";
import { Icon } from "@/components/shared/icons";
import { ROLE_LABELS } from "@/lib/auth/config";
import Image from "next/image";
import Link from "next/link";

// Menu pengguna (tanpa JavaScript tambahan): <details> bawaan HTML.
export function UserMenu({ user, base }) {
  const initial = (user.fullName || "?").trim().charAt(0).toUpperCase();
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <span className="relative flex size-9 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground">{user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill unoptimized className="object-cover" /> : initial}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight">{user.fullName}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
        </span>
        <Icon name="chevronDown" className="hidden size-4 sm:block" />
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-card">
        <p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email}</p>
        <Link href={`${base}/profile`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted">
          <Icon name="user" className="size-4" /> Profil saya
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-muted">
            <Icon name="logout" className="size-4" /> Keluar
          </button>
        </form>
      </div>
    </details>
  );
}
