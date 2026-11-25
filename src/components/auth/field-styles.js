// Kelas Tailwind yang dipakai bersama oleh seluruh field form autentikasi.
// Ada dua varian ukuran sesuai desain:
//   - "login"    : input besar pada kartu Login
//   - "register" : input pada halaman Registrasi Supplier
// Di layar lg ke atas ukuran memakai satuan desain --u (lihat globals.css).

const CONTROL_BASE =
  "block w-full border border-field-border bg-card font-medium text-foreground shadow-field placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

export const FIELD_VARIANTS = {
  login: {
    label:
      "mb-2 block pl-2 text-base font-medium text-foreground lg:mb-[calc(10*var(--u))] lg:pl-[calc(9.5*var(--u))] lg:text-[length:calc(23*var(--u))] lg:leading-[calc(32*var(--u))]",
    control: `${CONTROL_BASE} h-14 rounded-xl px-5 text-base lg:h-[calc(66*var(--u))] lg:rounded-[calc(16*var(--u))] lg:px-[calc(26.9*var(--u))] lg:text-[length:calc(21*var(--u))]`,
    // Ruang di sisi kanan untuk tombol mata
    withIcon: "pr-14 lg:pr-[calc(70*var(--u))]",
    iconButton: "right-3 lg:right-[calc(20*var(--u))]",
  },
  register: {
    label:
      "mb-2 block pl-2 text-base font-medium text-foreground lg:mb-[calc(7.2*var(--u))] lg:pl-[calc(7.4*var(--u))] lg:text-[length:calc(19.4*var(--u))] lg:leading-[calc(29.1*var(--u))]",
    control: `${CONTROL_BASE} h-12 rounded-xl px-4 text-base lg:h-[calc(60.5*var(--u))] lg:rounded-[calc(9.5*var(--u))] lg:px-[calc(17.8*var(--u))] lg:text-[length:calc(17.7*var(--u))]`,
    withIcon: "pr-14 lg:pr-[calc(70*var(--u))]",
    iconButton: "right-3 lg:right-[calc(20*var(--u))]",
  },
};
