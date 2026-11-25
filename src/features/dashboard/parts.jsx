import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/charts";
import { statusLabel } from "@/lib/labels";

export const STOCK_COLORS = { Normal: "var(--success)", Low: "var(--warning)", Severe: "var(--destructive)", "Out of Stock": "var(--neutral)" };

export function StockDonut({ stock, title = "Kondisi stok" }) {
  const total = Object.values(stock).reduce((a, b) => a + b, 0);
  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="flex flex-wrap items-center justify-center gap-6 py-2">
        <DonutChart centerLabel="Produk" centerValue={total} segments={Object.entries(stock).map(([label, value]) => ({ label: statusLabel(label), value, color: STOCK_COLORS[label] }))} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Menipis = di bawah batas stok rendah. Kritis = di bawah stok minimum. Habis = stok 0.</p>
    </Card>
  );
}

// Daftar ringkas dengan tautan "lihat semua"
export function MiniList({ title, description, href, empty, children, count, wide }) {
  return (
    <Card className={wide ? "h-full lg:col-span-2" : "h-full"}>
      <CardHeader title={title} description={description} action={href && <Link href={href} className="text-sm font-medium text-primary hover:underline">Lihat semua</Link>} />
      {count === 0 ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border">{children}</ul>}
    </Card>
  );
}

export function Row({ href, primary, secondary, right }) {
  const inner = (
    <>
      <span className="min-w-0"><span className="block truncate text-sm font-medium">{primary}</span>{secondary && <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}</span>
      {right && <span className="shrink-0 text-sm">{right}</span>}
    </>
  );
  return <li>{href ? <Link href={href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/40">{inner}</Link> : <div className="flex items-center justify-between gap-3 py-2.5">{inner}</div>}</li>;
}

// Judul kelompok pada dashboard, mis. "Perlu tindakan Anda"
export function Section({ title, hint }) {
  return (
    <div className="mb-2 mt-6 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
