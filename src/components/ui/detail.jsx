import { idText, statusLabel } from "@/lib/labels";
import { Card, CardHeader } from "@/components/ui/card";
import { PhotoLink } from "@/components/ui/photo-viewer";
import { Icon } from "@/components/shared/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

// Komponen kecil yang dipakai halaman detail (PO, pengiriman, pemeriksaan, klaim, barang keluar).

export function Info({ label, children, className }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children === 0 ? "0" : children || "-"}</dd>
    </div>
  );
}

// Foto bukti: thumbnail yang membuka gambar besar di halaman, dengan tombol Kembali
export function Photo({ src, alt = "Foto bukti", className, label }) {
  if (!src) return null;
  return (
    <PhotoLink src={src} alt={alt} className={cn("group inline-flex cursor-pointer flex-col items-start gap-1", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="size-24 rounded-xl border border-border bg-muted object-cover transition group-hover:opacity-80" />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </PhotoLink>
  );
}

export function Notice({ tone = "info", title, children }) {
  const tones = {
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-destructive",
    success: "bg-success-soft text-success",
  };
  return (
    <div className={cn("flex gap-3 rounded-xl p-3 text-sm", tones[tone])}>
      <Icon name={tone === "success" ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

// Linimasa riwayat: events = [{ at, title, note, by }]
export function Timeline({ title = "Riwayat", events }) {
  const sorted = [...events].filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  return (
    <Card>
      <CardHeader title={title} />
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
      ) : (
        <ol className="space-y-4 border-l border-border pl-4">
          {sorted.map((event, index) => (
            <li key={index} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-primary" />
              <p className="text-sm font-medium">{idText(event.title)}</p>
              {event.note && <p className="text-sm text-muted-foreground">{event.note}</p>}
              <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}{event.by ? ` · ${event.by}` : ""}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// Langkah alur (stepper) untuk menunjukkan posisi proses saat ini
export function Steps({ steps, current, failed }) {
  const index = steps.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
      {steps.map((step, i) => {
        const done = index >= 0 && i < index;
        const active = i === index;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                done && "border-success/40 bg-success-soft text-success",
                active && !failed && "border-primary bg-primary text-primary-foreground",
                active && failed && "border-destructive bg-danger-soft text-destructive",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done && <Icon name="check" className="size-3" />}
              {statusLabel(step)}
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
