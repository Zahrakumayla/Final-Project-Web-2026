import Image from "next/image";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/login-form";
import LandingBackground from "@/components/landing/landing-background";
import SiteFooter from "@/components/landing/site-footer";
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

      <main className="relative flex flex-1 flex-col gap-8 px-5 pb-10 pt-6 sm:px-8 lg:flex-row lg:items-center lg:justify-center lg:gap-[calc(130*var(--u))] lg:px-[calc(60*var(--u))] lg:py-[calc(30*var(--u))]">
        {/* Kolom kiri: logo + tagline */}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Image
            src="/logos/ayvora-logo.png"
            alt="AYVORA"
            width={3133}
            height={453}
            loading="eager"
            className="h-auto w-56 sm:w-72 lg:w-[calc(560*var(--u))]"
          />
          <p className="mt-5 text-xl font-bold leading-normal sm:text-2xl lg:mt-[calc(44*var(--u))] lg:text-[length:calc(42*var(--u))] lg:leading-[calc(62*var(--u))]">
            <span className="block">Mengelola Setiap Barang,</span>
            <span className="block">Menghubungkan setiap Proses</span>
          </p>
        </section>

        {/* Kolom kanan: kartu login */}
        <section className="mx-auto w-full max-w-md rounded-[2rem] bg-card px-6 py-8 text-foreground shadow-card sm:px-8 lg:mx-0 lg:max-w-none lg:w-[calc(620*var(--u))] lg:shrink-0 lg:rounded-[calc(33*var(--u))] lg:px-[calc(44*var(--u))] lg:pb-[calc(56*var(--u))] lg:pt-[calc(52*var(--u))]">
          <LoginForm />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
