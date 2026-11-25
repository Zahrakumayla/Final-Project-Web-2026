import Image from "next/image";
import { Fragment } from "react";
import { CONTACT_INFO } from "@/lib/constants";

// Konten halaman Tentang Kami. Server Component.
export default function AboutSection() {
  return (
    <section className="relative flex flex-1 flex-col justify-center px-6 pb-10 pt-28 sm:px-10 lg:px-[calc(65*var(--u))] lg:pb-0 lg:pt-[calc(56.4*var(--u))]">
      <div className="text-base font-medium leading-relaxed sm:text-lg lg:max-w-[calc(920*var(--u))] lg:text-[length:calc(22.35*var(--u))] lg:leading-normal">
        {/* space-y-[1.5em] = jarak antarparagraf setara satu baris teks, seperti desain */}
        <div className="space-y-[1.5em]">
          <p>
            <strong className="font-bold">AYVORA</strong> merupakan platform
            pengelolaan gudang dan persediaan yang dirancang untuk membantu
            distributor kemasan ramah lingkungan dalam mengelola aktivitas
            operasional secara lebih terstruktur.
          </p>
          <p>
            Melalui AYVORA, proses pengadaan barang, penerimaan, penyimpanan,
            hingga pengeluaran stok dapat dikelola dalam satu sistem yang
            saling terhubung. Dengan begitu, setiap aktivitas persediaan lebih
            mudah dipantau dan informasi barang dapat dikelola dengan lebih
            akurat.
          </p>
          <p>
            Kami ingin menghadirkan pengelolaan gudang yang lebih praktis,
            transparan, dan efisien untuk mendukung kebutuhan bisnis yang
            terus berkembang.
          </p>
        </div>

        <address className="mt-8 flex flex-col gap-1 font-semibold not-italic sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-[0.6em] lg:mt-[calc(57*var(--u))]">
          {CONTACT_INFO.map((item, index) => (
            <Fragment key={item}>
              {index > 0 && (
                <span aria-hidden="true" className="hidden font-bold sm:inline">
                  |
                </span>
              )}
              <span>{item}</span>
            </Fragment>
          ))}
        </address>
      </div>

      {/* Visual pendukung: di bawah teks pada layar kecil, di kanan bawah pada desktop */}
      <Image
        src="/images/products/ayvora-packaging.png"
        alt="Kemasan ramah lingkungan AYVORA: paper bag, paper cup, dan kotak bagasse dikelilingi dedaunan"
        width={1234}
        height={1005}
        sizes="(min-width: 1024px) 32vw, 80vw"
        className="mx-auto mt-10 h-auto w-4/5 max-w-sm lg:absolute lg:bottom-[calc(63*var(--u))] lg:right-[calc(85*var(--u))] lg:mx-0 lg:mt-0 lg:w-[calc(482*var(--u))] lg:max-w-none"
      />
    </section>
  );
}
