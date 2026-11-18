import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/shared/icons";
import { LOGIN_PATH } from "@/lib/constants";

// Hero Beranda. Server Component (tidak butuh interaksi browser).
// Di lg ke atas ukuran memakai satuan desain --u (lihat globals.css);
// di bawah lg layout menjadi satu kolom dengan ukuran Tailwind biasa.
export default function HeroSection() {
  return (
    <section className="relative flex flex-1 flex-col justify-center px-6 pb-10 pt-28 sm:px-10 lg:px-[calc(51*var(--u))] lg:pb-[calc(25*var(--u))] lg:pt-12">
      <div>
        <p className="text-base font-medium italic text-secondary lg:text-[calc(21.1*var(--u))] lg:leading-[calc(30*var(--u))]">
          #saynotoplastic
        </p>

        {/* Baris 2 sedikit lebih besar dari baris 1 (sesuai desain), keduanya bold.
            Di bawah lg ukurannya mengalir mengikuti lebar layar (clamp + vw). */}
        <h1 className="mt-4 leading-tight lg:mt-[calc(48*var(--u))]">
          <span className="block text-[clamp(1.45rem,6.8vw,2.9rem)] font-bold text-foreground lg:text-[calc(86*var(--u))] lg:leading-[calc(100*var(--u))]">
            Kemasan Lebih Baik,
          </span>
          <span className="block text-[clamp(1.7rem,7.95vw,3.4rem)] font-bold text-secondary text-shadow-headline lg:text-[calc(98*var(--u))] lg:leading-[calc(126*var(--u))]">
            Bumi Lebih Terjaga
          </span>
        </h1>

        <p className="mt-4 text-lg font-medium text-foreground sm:text-2xl lg:mt-[calc(22.6*var(--u))] lg:text-[length:calc(28.9*var(--u))] lg:leading-[calc(44*var(--u))]">
          Temukan Kemasan yang Tepat untuk Bisnis Anda
        </p>

        <Link
          href={LOGIN_PATH}
          className="mt-8 inline-flex h-12 items-center gap-3 rounded-full bg-primary px-8 text-base font-medium text-primary-foreground shadow-cta lg:mt-[calc(53*var(--u))] lg:h-[calc(70*var(--u))] lg:gap-[calc(14*var(--u))] lg:px-[calc(46*var(--u))] lg:text-[calc(32*var(--u))]"
        >
          Masuk ke AYVORA
          <ArrowRightIcon className="w-5 lg:w-[calc(17*var(--u))]" />
        </Link>
      </div>

      {/* Visual produk: di bawah teks pada layar kecil, di kanan bawah pada desktop */}
      <Image
        src="/images/products/ayvora-packaging.png"
        alt="Kemasan ramah lingkungan AYVORA: paper bag, paper cup, dan kotak bagasse dikelilingi dedaunan"
        width={1234}
        height={1005}
        loading="eager"
        sizes="(min-width: 1024px) 54vw, 90vw"
        className="mx-auto mt-10 h-auto w-full max-w-md lg:absolute lg:bottom-[calc(33*var(--u))] lg:right-[calc(30*var(--u))] lg:mx-0 lg:mt-0 lg:w-[calc(811*var(--u))] lg:max-w-none"
      />
    </section>
  );
}
