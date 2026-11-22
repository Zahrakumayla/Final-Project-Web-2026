"use client";

import { Icon } from "@/components/shared/icons";

// Tombol terang/gelap. Pilihan disimpan di browser (hanya kenyamanan per-pengguna).
export function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("ayvora-theme", isDark ? "dark" : "light");
    } catch {
      // penyimpanan browser bisa diblokir; tema tetap berubah untuk sesi ini
    }
  }

  return (
    <button type="button" onClick={toggle} aria-label="Ganti tema terang/gelap" className="flex size-10 cursor-pointer items-center justify-center rounded-xl text-foreground hover:bg-muted">
      <Icon name="moon" className="size-5 dark:hidden" />
      <Icon name="sun" className="hidden size-5 dark:block" />
    </button>
  );
}
