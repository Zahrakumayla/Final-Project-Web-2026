import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { Icon } from "@/components/shared/icons";
import { MobileMenu } from "@/components/layout/mobile-menu";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { ToastProvider } from "@/components/ui/toast";
import { requireRole } from "@/lib/auth/guards";
import { FLASH_COOKIE } from "@/lib/action-helpers";
import { getHomePath } from "@/lib/permissions";
import { NAV_BY_ROLE } from "@/lib/nav";
import { countUnread } from "@/services/notifications";

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/logos/ayvora-logo.png" alt="" width={36} height={36} className="size-9 object-contain" />
      <span className="text-lg font-bold tracking-wide text-primary">AYVORA</span>
    </span>
  );
}

function readFlash(cookieStore) {
  const raw = cookieStore.get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const flash = JSON.parse(raw);
    return flash && typeof flash.message === "string" ? flash : null;
  } catch {
    return null;
  }
}

// Kerangka semua dashboard: sidebar + header. Role diperiksa di server (requireRole),
// jadi role lain yang membuka URL ini langsung dialihkan ke dashboard miliknya.
export async function AppShell({ allowedRoles, children }) {
  const user = await requireRole(allowedRoles);
  const base = getHomePath(user.role);
  const items = NAV_BY_ROLE[user.role];
  const unread = await countUnread(user.id);
  const flash = readFlash(await cookies());

  return (
    <ToastProvider flash={flash}>
      <div className="min-h-dvh bg-background">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-border bg-surface p-5 lg:flex">
          <Link href={base} aria-label="Ke dashboard"><Brand /></Link>
          <div className="-mx-1 flex-1 overflow-y-auto px-1"><SidebarNav items={items} /></div>
        </aside>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
            <div className="flex items-center gap-2">
              <MobileMenu items={items} brand={<Brand />} />
              <p className="hidden text-sm text-muted-foreground sm:block">Ayla Innovation Warehouse</p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Link href={`${base}/notifications`} aria-label={`Notifikasi, ${unread} belum dibaca`} className="relative flex size-10 items-center justify-center rounded-xl hover:bg-muted">
                <Icon name="bell" className="size-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4.5 text-surface">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
              <UserMenu user={user} base={base} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
