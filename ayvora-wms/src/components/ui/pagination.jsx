import Link from "next/link";
import { buildHref, cn } from "@/lib/cn";
import { Icon } from "@/components/shared/icons";

// Navigasi halaman. `info` berasal dari pageInfo() di lib/list-params.js
export function Pagination({ basePath, params, info }) {
  if (info.total === 0) return null;

  const pageLink = (page) => buildHref(basePath, params, { page: page > 1 ? page : "" });
  const linkClass = "flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium hover:bg-muted";

  // Tampilkan paling banyak 5 nomor di sekitar halaman aktif
  const start = Math.max(1, Math.min(info.page - 2, info.totalPages - 4));
  const pages = Array.from({ length: Math.min(5, info.totalPages) }, (_, index) => start + index);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Menampilkan {info.from}-{info.to} dari {info.total} data
      </p>
      <nav aria-label="Halaman" className="flex items-center gap-1.5">
        {info.page > 1 ? (
          <Link href={pageLink(info.page - 1)} aria-label="Halaman sebelumnya" className={linkClass}><Icon name="chevronLeft" className="size-4" /></Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")}><Icon name="chevronLeft" className="size-4" /></span>
        )}
        {pages.map((page) => (
          <Link
            key={page}
            href={pageLink(page)}
            aria-current={page === info.page ? "page" : undefined}
            className={cn(linkClass, page === info.page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
          >
            {page}
          </Link>
        ))}
        {info.page < info.totalPages ? (
          <Link href={pageLink(info.page + 1)} aria-label="Halaman berikutnya" className={linkClass}><Icon name="chevronRight" className="size-4" /></Link>
        ) : (
          <span className={cn(linkClass, "pointer-events-none opacity-40")}><Icon name="chevronRight" className="size-4" /></span>
        )}
      </nav>
    </div>
  );
}
