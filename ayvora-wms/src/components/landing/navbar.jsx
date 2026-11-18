"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MobileNavigation from "@/components/landing/mobile-navigation";
import { NAV_ITEMS, SITE_NAME } from "@/lib/constants";

// Navbar dibuat "absolute" di atas background sehingga foto terlihat penuh
// di belakangnya, sama seperti desain. Perlu "use client" karena memakai
// usePathname() untuk menandai menu yang sedang aktif.
export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7 md:pr-[6vw] lg:pl-[calc(63*var(--u))] lg:pr-[calc(226.5*var(--u))] lg:pt-[calc(44*var(--u))]">
      <Link href="/" aria-label={`${SITE_NAME} - ke Beranda`}>
        <Image
          src="/logos/ayvora-logo.png"
          alt={SITE_NAME}
          width={3133}
          height={453}
          loading="eager"
          className="h-auto w-[180px] sm:w-[240px] lg:w-[calc(348*var(--u))]"
        />
      </Link>

      {/* Menu desktop/tablet */}
      <nav
        aria-label="Navigasi utama"
        className="hidden items-center gap-10 md:flex lg:gap-[calc(63*var(--u))] lg:pt-[calc(5.5*var(--u))]"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative px-1.5 text-lg leading-normal text-foreground lg:px-[calc(5.5*var(--u))] lg:text-[length:calc(22.5*var(--u))] ${
                isActive
                  ? "font-bold after:absolute after:inset-x-0 after:-bottom-0.5 after:h-[3px] after:rounded-full after:bg-primary lg:after:-bottom-[calc(3.3*var(--u))] lg:after:h-[calc(4.5*var(--u))]"
                  : "font-semibold hover:opacity-70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Menu mobile */}
      <MobileNavigation items={NAV_ITEMS} pathname={pathname} />
    </header>
  );
}
