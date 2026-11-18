"use client";

import { useState } from "react";
import Link from "next/link";
import { CloseIcon, MenuIcon } from "@/components/shared/icons";

// Menu untuk layar kecil (di bawah breakpoint md). Perlu "use client"
// karena menyimpan state buka/tutup.
export default function MobileNavigation({ items, pathname }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={isOpen ? "Tutup menu" : "Buka menu"}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
        onClick={() => setIsOpen((current) => !current)}
        className="flex size-11 items-center justify-center rounded-full text-primary"
      >
        {isOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
      </button>

      {isOpen && (
        <nav
          id="mobile-menu"
          aria-label="Navigasi utama"
          className="absolute inset-x-5 top-full mt-2 flex flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-lg sm:inset-x-8"
        >
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setIsOpen(false)}
                className={`rounded-xl px-4 py-3 text-lg text-foreground ${
                  isActive ? "bg-muted font-bold" : "font-semibold"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
