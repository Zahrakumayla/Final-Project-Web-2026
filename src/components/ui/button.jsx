import Link from "next/link";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  outline: "border border-border bg-surface text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  danger: "bg-destructive text-surface hover:opacity-90",
};

const SIZES = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-6 text-base",
};

export function buttonClass({ variant = "primary", size = "md", className } = {}) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({ variant, size, className, type = "button", ...props }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
