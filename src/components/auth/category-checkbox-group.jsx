import { CheckIcon } from "@/components/shared/icons";

// Daftar checkbox kategori produk. Boleh memilih lebih dari satu.
// Nilai yang dikirim: `categoryIds` (satu entri per kategori terpilih).
export default function CategoryCheckboxGroup({ categories, selectedIds = [], error }) {
  return (
    <fieldset className="mt-8 lg:mt-[calc(42.4*var(--u))]" aria-describedby={error ? "categoryIds-error" : undefined}>
      <legend className="mb-3 block pl-2 text-base font-medium lg:mb-[calc(12.9*var(--u))] lg:pl-[calc(7.4*var(--u))] lg:text-[length:calc(19.4*var(--u))] lg:leading-[calc(29.1*var(--u))]">
        Kategori Produk
      </legend>

      <div className="flex flex-col gap-3 pl-2 lg:gap-[calc(13.2*var(--u))] lg:pl-[calc(7.4*var(--u))]">
        {categories.map((category) => (
          <label
            key={category.id}
            className="flex w-fit cursor-pointer items-center gap-3 text-base lg:gap-[calc(15.7*var(--u))] lg:text-[length:calc(18.5*var(--u))] lg:leading-[calc(22*var(--u))]"
          >
            <span className="relative flex size-[22px] shrink-0 lg:size-[calc(22*var(--u))]">
              <input
                type="checkbox"
                name="categoryIds"
                value={category.id}
                defaultChecked={selectedIds.includes(category.id)}
                className="peer size-full cursor-pointer appearance-none rounded-[2px] border border-field-icon bg-surface checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              />
              <CheckIcon className="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-primary-foreground peer-checked:block lg:size-[calc(14*var(--u))]" />
            </span>
            {category.name}
          </label>
        ))}
      </div>

      {error && (
        <p id="categoryIds-error" role="alert" className="mt-2 pl-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
