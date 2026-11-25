"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/shared/icons";

// Gambar yang dibuka di dalam halaman (bukan tab baru), dengan tombol Kembali.
// Dipakai di semua tempat yang menampilkan foto bukti / pratinjau gambar.
export function PhotoLink({ src, alt = "Foto bukti", className, children }) {
  const [open, setOpen] = useState(false);

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
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={`Lihat ${alt}`}>
        {children}
      </button>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[60] flex flex-col bg-black/85">
          <div className="flex items-center justify-between px-4 py-3">
            <button type="button" onClick={() => setOpen(false)} className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-black hover:bg-white/90">
              <Icon name="chevronLeft" className="size-4" /> Kembali
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0" onClick={() => setOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
