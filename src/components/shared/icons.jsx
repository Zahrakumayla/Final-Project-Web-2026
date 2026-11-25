// Ikon SVG sederhana. Memakai currentColor sehingga warnanya mengikuti teks
// (jadi tetap lewat token tema, bukan hex). Ditulis manual agar tidak perlu
// menambah package pada tahap awal.

export function ArrowRightIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 12h16" />
      <path d="m14 6 6 6-6 6" />
    </svg>
  );
}

export function MenuIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 12H3" />
      <path d="m9 6-6 6 6 6" />
    </svg>
  );
}

// Mata tertutup: dipakai saat kata sandi disembunyikan (sesuai desain).
export function EyeClosedIcon({ className }) {
  return (
    <svg
      viewBox="0 0 28 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M1.5 3.2C7.5 9.2 20.5 9.2 26.5 3.2" />
      <path d="M2.6 4.3 1 6.6" />
      <path d="m25.4 4.3 1.6 2.3" />
      <path d="M9 7.1 8.2 9.9" />
      <path d="m19 7.1.8 2.8" />
    </svg>
  );
}

// Mata terbuka: dipakai saat kata sandi ditampilkan.
export function EyeOpenIcon({ className }) {
  return (
    <svg
      viewBox="0 0 28 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M1.5 9C6 3 22 3 26.5 9 22 15 6 15 1.5 9Z" />
      <circle cx="14" cy="9" r="3.2" />
    </svg>
  );
}

export function CheckIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Ikon dashboard. Dipakai lewat <Icon name="box" className="size-5" />.
// Gaya: garis 1.8px, 24x24, mengikuti warna teks (currentColor).
// ---------------------------------------------------------------------------
const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>,
  tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" /><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2" /></>,
  truck: <><path d="M2 6h11v10H2z" /><path d="M13 9h4.5L21 12.5V16h-8" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5" /></>,
  logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m16 8 4 4-4 4" /><path d="M20 12H9" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="m9 13 2 2 4-4" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5" /><path d="M13 16V8" /><path d="M18 16v-3" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6H3v-6l2-8Z" /></>,
  send: <><path d="m21 3-9.5 18-2.5-8-8-2.5L21 3Z" /><path d="m9 13 12-10" /></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
  star: <path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.3l1.1-6.2L3 9.7l6.2-.9L12 3Z" />,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  warehouse: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-7h10v7" /><path d="M7 17.5h10" /></>,
  package: <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z" /><path d="m3 7.5 9 4.5 9-4.5" /><path d="M12 12v9" /><path d="m7.5 5.2 9 4.5" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v5l3 2" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5L5 20" /></>,
  upload: <><path d="M12 16V5" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
};

export function Icon({ name, className = "size-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[name] ?? ICON_PATHS.box}
    </svg>
  );
}
