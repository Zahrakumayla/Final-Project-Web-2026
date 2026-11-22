import { Icon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

// Baris pencarian + filter untuk halaman daftar. Memakai form GET biasa sehingga
// hasilnya ada di URL (bisa di-bookmark) dan tidak butuh JavaScript.
// filters: [{ name, label, options: [{ value, label }] }]
export function FilterBar({ basePath, params, placeholder = "Cari...", filters = [], extra }) {
  const hasActive = Boolean(params.q) || filters.some((filter) => params.filters?.[filter.name]);
  return (
    <form method="get" action={basePath} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1 sm:max-w-sm">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder={placeholder}
          aria-label="Cari"
          className="h-11 w-full rounded-xl border border-field-border bg-card pl-10 pr-3 text-sm placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        />
      </div>
      {filters.map((filter) => (
        <Select key={filter.name} name={filter.name} aria-label={filter.label} defaultValue={params.filters?.[filter.name] ?? ""} className="w-auto min-w-36">
          <option value="">{filter.label}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      ))}
      {params.sort && <input type="hidden" name="sort" value={params.sort} />}
      {params.dir && <input type="hidden" name="dir" value={params.dir} />}
      {extra}
      <Button type="submit" variant="secondary">Terapkan</Button>
      {hasActive && <ButtonLink href={basePath} variant="ghost">Reset</ButtonLink>}
    </form>
  );
}
