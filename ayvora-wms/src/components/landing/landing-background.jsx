import Image from "next/image";

// Foto background krem (dinding + lantai) yang dipakai Beranda & Tentang Kami.
// Posisi object-bottom menjaga lantai tetap terlihat di bawah produk
// ketika rasio layar berbeda dari desain.
export default function LandingBackground() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10">
      <Image
        src="/images/backgrounds/ayvora-background.png"
        alt=""
        fill
        sizes="100vw"
        loading="eager"
        className="object-cover object-bottom"
      />
      {/* Transparan di light mode; menggelapkan foto di dark mode. */}
      <div className="absolute inset-0 bg-scrim" />
    </div>
  );
}
