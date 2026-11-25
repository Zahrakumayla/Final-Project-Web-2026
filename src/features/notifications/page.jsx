import { idText } from "@/lib/labels";
import { openNotificationAction } from "@/actions/notifications";
import { Icon } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/table";
import { ReadAllButton } from "@/features/notifications/read-all-button";
import { requirePermission } from "@/lib/auth/guards";
import { buildHref, cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import { getHomePath } from "@/lib/permissions";
import { listNotifications } from "@/services/notifications";


const TABS = [
  { value: "", label: "Semua" },
  { value: "unread", label: "Belum dibaca" },
  { value: "read", label: "Sudah dibaca" },
];

const TYPE_ICON = { restock_late: "clock", restock: "clipboard", transaction: "check", issue: "alert", supplier: "shield" };

export default async function NotificationsPage({ searchParams }) {
  const user = await requirePermission("NOTIFICATION_VIEW");
  const base = `${getHomePath(user.role)}/notifications`;
  const { rows, params, info } = await listNotifications(user.id, await searchParams);

  return (
    <>
      <PageHeader title="Notifikasi" actions={<ReadAllButton />} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <ButtonLink key={tab.value} href={buildHref(base, {}, { status: tab.value })} size="sm" variant={params.filters.status === tab.value ? "primary" : "outline"}>
            {tab.label}
          </ButtonLink>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="bell" title="Belum ada notifikasi" description="Pemberitahuan baru akan muncul di sini." />
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((item) => (
            <form key={item.id} action={openNotificationAction}>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className={cn("flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left hover:bg-muted/60", !item.is_read && "bg-primary/5")}>
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                  <Icon name={TYPE_ICON[item.type] ?? "bell"} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm", item.is_read ? "font-medium" : "font-semibold")}>{idText(item.title)}</span>
                    {!item.is_read && <Badge tone="primary">Baru</Badge>}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{idText(item.message)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{formatRelativeTime(item.created_at)}</span>
                </span>
              </button>
            </form>
          ))}
        </Card>
      )}
      <Pagination basePath={base} params={{ status: params.filters.status }} info={info} />
    </>
  );
}
