import { cn } from "@/lib/cn";

const CONTROL =
  "block w-full rounded-lg border border-field-border bg-card px-3 text-sm text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60 read-only:bg-muted";

export function FormField({ id, label, error, hint, required, children, className }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ id, hasError, className, ...props }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      aria-invalid={hasError || undefined}
      aria-describedby={hasError ? `${id}-error` : undefined}
      className={cn(CONTROL, "h-10", hasError && "border-destructive", className)}
      {...props}
    />
  );
}

export function Select({ id, hasError, className, children, ...props }) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      aria-invalid={hasError || undefined}
      className={cn(CONTROL, "h-10 cursor-pointer", hasError && "border-destructive", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ id, hasError, className, ...props }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      aria-invalid={hasError || undefined}
      className={cn(CONTROL, "min-h-20 resize-y py-2", hasError && "border-destructive", className)}
      {...props}
    />
  );
}

// Pesan hasil aksi form (error umum / sukses)
export function FormMessage({ state }) {
  if (!state?.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn("rounded-xl px-4 py-3 text-sm font-medium", isError ? "bg-danger-soft text-destructive" : "bg-success-soft text-success")}
    >
      {state.message}
    </p>
  );
}
