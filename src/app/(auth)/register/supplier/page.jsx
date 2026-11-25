import Image from "next/image";
import Link from "next/link";
import SupplierRegisterForm from "@/components/auth/supplier-register-form";
import SiteFooter from "@/components/landing/site-footer";
import { getCategories } from "@/lib/queries/categories";

export const metadata = {
  title: "Registrasi Supplier",
};

// Halaman registrasi supplier. Latar putih, tanpa navbar landing.
// Pilihan kategori dibaca dari tabel `categories`.
export default async function SupplierRegisterPage() {
  const categories = await getCategories();

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-foreground">
      <main className="mx-auto w-full max-w-[calc(1512*var(--u))] flex-1 px-5 pb-12 pt-6 sm:px-8 lg:pb-[calc(109.8*var(--u))] lg:pl-[calc(61.8*var(--u))] lg:pr-[calc(69.6*var(--u))] lg:pt-[calc(50*var(--u))]">
        <Link href="/" aria-label="AYVORA - ke Beranda" className="inline-block">
          <Image
            src="/logos/ayvora-logo.png"
            alt="AYVORA"
            width={3133}
            height={453}
            loading="eager"
            className="h-auto w-44 sm:w-56 lg:w-[calc(268*var(--u))]"
          />
        </Link>

        <SupplierRegisterForm categories={categories} />
      </main>

      <SiteFooter />
    </div>
  );
}
