import Link from "next/link";
import { buildHref, cn } from "@/lib/cn";
import { Icon } from "@/components/shared/icons";

export function TableWrap({ children }) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-surface">{children}</div>;
}

export function Table({ children }) {
  return <table className="w-full text-left text-sm">{children}</table>;
}

export function Th({ className, children }) {
  return (
    <th className={cn("whitespace-nowrap border-b border-border bg-muted/60 px-3 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground", className)}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }) {
  return <td className={cn("border-b border-border/70 px-3 py-2.5 align-middle", className)} {...props}>{children}</td>;
}

// Judul kolom yang bisa diklik untuk mengurutkan (lewat parameter URL ?sort=&dir=)
export function SortTh({ label, sortKey, basePath, params, className }) {
  const active = params.sort === sortKey;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  return (
    <Th className={className}>
      <Link href={buildHref(basePath, params, { sort: sortKey, dir: nextDir, page: "" })} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {active && <Icon name={params.dir === "asc" ? "chevronDown" : "chevronDown"} className={cn("size-3.5", params.dir === "asc" && "rotate-180")} />}
      </Link>
    </Th>
  );
}

export function EmptyState({ icon = "inbox", title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon name={icon} className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
