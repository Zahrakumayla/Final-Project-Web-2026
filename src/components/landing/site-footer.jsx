import { FOOTER_TEXT } from "@/lib/constants";

// Strip footer olive. Server Component.
export default function SiteFooter() {
  return (
    <footer className="flex min-h-12 items-center justify-center bg-secondary px-4 py-3 text-center text-sm font-medium italic text-secondary-foreground sm:text-base lg:h-[calc(47*var(--u))] lg:py-0 lg:text-[length:calc(15.8*var(--u))]">
      {FOOTER_TEXT}
    </footer>
  );
}
