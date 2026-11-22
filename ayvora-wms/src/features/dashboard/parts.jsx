import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/charts";

export const STOCK_COLORS = { Normal: "var(--success)", Low: "var(--warning)", Severe: "var(--destructive)", "Out of Stock": "var(--neutral)" };

export function StockDonut({ stock, title = "Kondisi stok" }) {
  const total = Object.values(stock).reduce((a, b) => a + b, 0);
  return (
    <Card>
      <CardHeader title={title} description="Jumlah produk berdasarkan status stok." />
      <div className="flex flex-wrap items-center gap-6">
        <DonutChart centerLabel="Produk" centerValue={total} segments={Object.entries(stock).map(([label, value]) => ({ label, value, color: STOCK_COLORS[label] }))} />
      </div>
    </Card>
  );
}

// Daftar ringkas dengan tautan "lihat semua"
export function MiniList({ title, description, href, empty, children, count }) {
  return (
    <Card>
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
