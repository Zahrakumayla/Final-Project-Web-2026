import Link from "next/link";
import { LOGIN_PATH } from "@/lib/constants";

// Ditampilkan setelah registrasi supplier berhasil.
// Catatan: tampilan ini tidak ada pada desain; dibuat sederhana mengikuti gaya form.
export default function SupplierRegisterSuccess() {
  return (
    <div role="status" className="mx-auto mt-16 max-w-xl text-center lg:mt-[calc(120*var(--u))]">
      <h1 className="text-2xl font-semibold lg:text-[length:calc(34.2*var(--u))] lg:leading-[calc(51.3*var(--u))]">
        Pendaftaran Berhasil
      </h1>
      <p className="mt-3 text-base font-medium leading-relaxed lg:mt-[calc(14*var(--u))] lg:text-[length:calc(19.7*var(--u))]">
        Akun supplier Anda sudah dibuat dan sedang menunggu persetujuan admin. Anda dapat masuk setelah akun
        disetujui.
      </p>
      <Link
        href={LOGIN_PATH}
        className="mt-8 inline-flex h-14 items-center justify-center rounded-2xl bg-primary px-10 text-lg font-semibold text-primary-foreground shadow-field lg:mt-[calc(40*var(--u))] lg:h-[calc(70.3*var(--u))] lg:rounded-[calc(16*var(--u))] lg:px-[calc(56*var(--u))] lg:text-[length:calc(22*var(--u))]"
      >
        Kembali ke Halaman Masuk
      </Link>
    </div>
  );
}
