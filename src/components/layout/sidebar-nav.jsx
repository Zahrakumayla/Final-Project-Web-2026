"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

// Satu tautan menu aktif jika path persis sama (`exact`, untuk Dashboard) atau berada di bawahnya.
function isActive(pathname, item) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname, onNavigate, nested = false }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition",
        nested ? "px-3 py-2" : "px-3 py-2",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon name={item.icon} className={cn("shrink-0", nested ? "size-4" : "size-5")} />
      {item.label}
    </Link>
  );
}

// Grup dropdown: bisa dibuka/ditutup. Otomatis terbuka saat salah satu submenu sedang aktif.
function NavGroup({ item, pathname, onNavigate }) {
  const hasActiveChild = item.children.some((child) => isActive(pathname, child));
  const [open, setOpen] = useState(hasActiveChild);
  const [lastPath, setLastPath] = useState(pathname);
  const panelId = `nav-group-${item.label.toLowerCase().replace(/\s+/g, "-")}`;

  // Pindah ke halaman submenu (mis. lewat tautan di dalam halaman) -> grupnya ikut terbuka
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (hasActiveChild && !open) setOpen(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
          hasActiveChild ? "bg-muted font-semibold text-primary" : "text-foreground hover:bg-muted",
        )}
      >
        <Icon name={item.icon} className="size-5 shrink-0" />
        <span className="flex-1">{item.label}</span>
        <Icon name="chevronDown" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="ml-5 mt-1 flex flex-col gap-1 border-l border-border pl-3">
          {item.children.map((child) => (
            <NavLink key={child.href} item={child} pathname={pathname} onNavigate={onNavigate} nested />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ items, onNavigate }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-1">
      {items.map((item) =>
        item.children ? (
          <NavGroup key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
        ) : (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}
