import { cn } from "@/lib/cn";
import { Icon } from "@/components/shared/icons";

export function Card({ className, children, ...props }) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
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
export function StatCard({ label, value, hint, icon = "box", tone = "primary" }) {
  return (
    <Card className="flex items-start gap-4">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", STAT_TONES[tone])}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
