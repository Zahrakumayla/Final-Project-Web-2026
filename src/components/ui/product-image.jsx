import Image from "next/image";
import { Icon } from "@/components/shared/icons";
import { cn } from "@/lib/cn";

// Gambar produk/kategori. Jika belum ada gambar, tampil placeholder.
export function ProductImage({ src, alt, className, rounded = "rounded-xl" }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted text-muted-foreground", rounded, className)}>
      {src ? (
        <Image src={src} alt={alt} fill unoptimized sizes="160px" className="object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center"><Icon name="image" className="size-1/2" /></span>
      )}
    </div>
  );
}
