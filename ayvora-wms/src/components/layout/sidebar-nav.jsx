"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

// Daftar menu sidebar. `exact` = aktif hanya jika path persis sama (untuk menu Dashboard).
export function SidebarNav({ items, onNavigate }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
              active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
            )}
          >
            <Icon name={item.icon} className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
