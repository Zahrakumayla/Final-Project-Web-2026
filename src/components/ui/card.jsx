import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shared/icons";

export function Card({ className, children, ...props }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-surface p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const STAT_TONES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
};

// Kartu ringkasan angka pada dashboard
export function StatCard({ label, value, hint, icon = "box", tone = "primary", href }) {
  const body = (
    <Card className={cn("flex h-full items-center gap-3", href && "transition hover:border-primary/50 hover:bg-muted/40")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", STAT_TONES[tone])}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold leading-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
