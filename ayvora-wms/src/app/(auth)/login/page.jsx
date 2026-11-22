import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/login-form";
import LandingBackground from "@/components/landing/landing-background";
import SiteFooter from "@/components/landing/site-footer";
import { ArrowLeftIcon } from "@/components/shared/icons";
import { getCurrentUser } from "@/lib/auth/guards";
import { getHomePath } from "@/lib/permissions";

export const metadata = {
  title: "Masuk",
};

// Halaman login untuk SEMUA role (admin, manager, staff, supplier).
// Latar foto krem + footer dipakai ulang dari landing page.
export default async function LoginPage() {
  // Sudah login? Tidak perlu melihat form lagi.
  const currentUser = await getCurrentUser();
  if (currentUser) redirect(getHomePath(currentUser.role));

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <LandingBackground />

      <main className="relative flex flex-1 flex-col gap-8 px-5 pb-10 pt-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-0 lg:pb-0 lg:pl-[calc(109*var(--u))] lg:pr-[calc(102.5*var(--u))] lg:pt-[calc(37*var(--u))]">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-base font-medium lg:absolute lg:left-[calc(109.1*var(--u))] lg:top-[calc(81.7*var(--u))] lg:gap-[calc(7.9*var(--u))] lg:text-[length:calc(22.4*var(--u))] lg:leading-[calc(33.6*var(--u))]"
        >
          <ArrowLeftIcon className="w-5 lg:w-[calc(18*var(--u))]" />
          Kembali
        </Link>

        {/* Kolom kiri: logo + tagline */}
        <section className="flex flex-col items-center text-center lg:mb-[calc(30*var(--u))] lg:items-start lg:text-left">
          <Image
            src="/logos/ayvora-logo.png"
            alt="AYVORA"
            width={3133}
            height={453}
            loading="eager"
            className="h-auto w-56 sm:w-72 lg:w-[calc(478.5*var(--u))]"
          />
          <p className="mt-5 text-xl font-bold leading-normal sm:text-2xl lg:mt-[calc(49.6*var(--u))] lg:-ml-[calc(2.6*var(--u))] lg:text-[length:calc(36.8*var(--u))] lg:leading-[calc(55.2*var(--u))]">
            <span className="block">Mengelola Setiap Barang,</span>
            <span className="block">Menghubungkan setiap Proses</span>
          </p>
        </section>

        {/* Kolom kanan: kartu login */}
        <section className="mx-auto w-full max-w-md rounded-[2rem] bg-card px-6 py-8 text-foreground shadow-card sm:px-8 lg:mx-0 lg:max-w-none lg:w-[calc(571.7*var(--u))] lg:rounded-[calc(33*var(--u))] lg:px-[calc(29.7*var(--u))] lg:pb-[calc(80.8*var(--u))] lg:pt-[calc(68.8*var(--u))]">
          <LoginForm />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
