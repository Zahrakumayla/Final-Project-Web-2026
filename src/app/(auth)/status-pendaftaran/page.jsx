import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import ResubmitForm from "@/components/auth/resubmit-form";
import LandingBackground from "@/components/landing/landing-background";
import SiteFooter from "@/components/landing/site-footer";
import { Icon } from "@/components/shared/icons";
import { getCurrentUser } from "@/lib/auth/guards";
import { getApplicant } from "@/lib/auth/service";
import { LOGIN_PATH } from "@/lib/constants";
import { getCategories } from "@/lib/queries/categories";
import { getHomePath } from "@/lib/permissions";

export const metadata = { title: "Status Pendaftaran" };

const INFO = {
  baru: "Pendaftaran berhasil dikirim.",
  ulang: "Data diperbaiki dan diajukan ulang.",
};

// Halaman untuk supplier yang belum disetujui: menunggu verifikasi Admin, atau ditolak (bisa memperbaiki & ajukan ulang).
export default async function StatusPendaftaranPage({ searchParams }) {
  const approved = await getCurrentUser();
  if (approved) redirect(getHomePath(approved.role));
  const applicant = await getApplicant();
  if (!applicant) redirect(LOGIN_PATH);
  if (applicant.supplier_status === "Approved") redirect(LOGIN_PATH);

  const { info } = await searchParams;
  const rejected = applicant.supplier_status === "Rejected";
  const categories = rejected ? await getCategories() : [];

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <LandingBackground />
      <header className="relative flex items-center justify-between px-5 pt-4 sm:px-8">
        <Link href="/" aria-label="AYVORA - ke Beranda">
          <Image src="/logos/ayvora-logo.png" alt="AYVORA" width={3133} height={453} loading="eager" className="h-auto w-36 sm:w-44" />
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-muted">Keluar</button>
        </form>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 py-6 sm:px-8">
        <section className={`w-full rounded-3xl bg-card p-6 shadow-card sm:p-8 ${rejected ? "max-w-3xl" : "max-w-xl"}`}>
          {INFO[info] && <p role="status" className="mb-4 rounded-xl bg-success-soft px-4 py-2.5 text-sm font-medium text-success">{INFO[info]}</p>}

          <div className="flex items-start gap-4">
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${rejected ? "bg-danger-soft text-destructive" : "bg-warning-soft text-warning"}`}>
              <Icon name={rejected ? "alert" : "clock"} className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold sm:text-2xl">{rejected ? "Pendaftaran belum disetujui" : "Pendaftaran sedang diverifikasi"}</h1>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                {rejected
                  ? "Lengkapi kekurangan di bawah ini, lalu ajukan ulang. Admin akan memeriksa lagi."
                  : `Terima kasih, ${applicant.company_name}. Admin sedang memeriksa data Anda. Anda bisa masuk setelah disetujui.`}
              </p>
            </div>
          </div>

          {rejected ? (
            <>
              <div className="mt-5 rounded-xl bg-danger-soft p-4 text-sm text-destructive">
                <p className="font-semibold">Alasan penolakan</p>
                <p className="mt-1">{applicant.supplier_review_note}</p>
              </div>
              <ResubmitForm applicant={applicant} categories={categories} />
            </>
          ) : (
            <>
              <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                {[["Pendaftaran terkirim", true], ["Verifikasi Admin", "now"], ["Akun aktif", false]].map(([label, state], i) => (
                  <li key={label} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${state === "now" ? "border-warning bg-warning-soft font-semibold" : state ? "border-success/40 bg-success-soft" : "border-border text-muted-foreground"}`}>
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${state === true ? "bg-success text-white" : state === "now" ? "bg-warning text-white" : "bg-muted"}`}>{state === true ? "✓" : i + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
              <dl className="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Perusahaan</dt><dd className="font-medium">{applicant.company_name}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-medium break-all">{applicant.email}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Telepon</dt><dd className="font-medium">{applicant.phone}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Kategori produk</dt><dd className="font-medium">{applicant.categories.map((c) => c.name).join(", ") || "-"}</dd></div>
              </dl>
            </>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
