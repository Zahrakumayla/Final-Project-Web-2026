import { cn } from "@/lib/cn";

// Grafik sederhana berbasis HTML/SVG (tanpa library) yang mengikuti warna tema.

// Batang vertikal. series: [{ name, tone }], data: [{ label, values: [n, n] }]
const BAR_TONES = { primary: "bg-primary", secondary: "bg-secondary", danger: "bg-destructive", warning: "bg-warning", info: "bg-info" };

export function BarChart({ series, data, height = 180 }) {
  const max = Math.max(1, ...data.flatMap((item) => item.values));
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }} role="img" aria-label="Grafik batang">
        {data.map((item) => (
          <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-1">
              {item.values.map((value, index) => (
                <div
                  key={series[index].name}
                  title={`${series[index].name}: ${value}`}
                  className={cn("w-full max-w-6 rounded-t-md", BAR_TONES[series[index].tone])}
                  style={{ height: `${Math.max(value > 0 ? 3 : 0, (value / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {data.map((item) => (
          <p key={item.label} className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">{item.label}</p>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs">
        {series.map((entry) => (
          <span key={entry.name} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", BAR_TONES[entry.tone])} />
            {entry.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// Diagram donat. segments: [{ label, value, color: "var(--success)" }]
export function DonutChart({ segments, centerLabel, centerValue }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative size-36">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label="Diagram donat">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="14" />
          {total > 0 && segments.map((segment) => {
            const length = (segment.value / total) * circumference;
            const circle = (
              <circle
                key={segment.label}
                cx="50" cy="50" r={radius} fill="none" stroke={segment.color} strokeWidth="14"
                strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{centerValue}</span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="ml-auto pl-4 font-semibold">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
