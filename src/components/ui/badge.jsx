import { cn } from "@/lib/cn";

const TONES = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
  primary: "bg-primary/10 text-primary",
};

export function Badge({ tone = "neutral", className, title, children }) {
  return (
    <span title={title} className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}
