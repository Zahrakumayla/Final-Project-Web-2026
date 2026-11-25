"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/shared/icons";
import { SidebarNav } from "@/components/layout/sidebar-nav";

// Tombol menu + laci navigasi untuk layar kecil (di bawah lg)
export function MobileMenu({ items, brand }) {
  const [open, setOpen] = useState(false);

  // Saat menu terbuka: tombol Esc menutup menu & halaman di belakang tidak ikut scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open} className="flex size-10 cursor-pointer items-center justify-center rounded-xl hover:bg-muted lg:hidden">
        <Icon name="menu" className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Tutup menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside role="dialog" aria-modal="true" aria-label="Menu navigasi" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup menu" className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
                <Icon name="x" className="size-5" />
              </button>
            </div>
            <SidebarNav items={items} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
