"use client";

import { useActionState } from "react";
import { registerSupplierAction } from "@/actions/auth";
import CategoryCheckboxGroup from "@/components/auth/category-checkbox-group";
import Field from "@/components/auth/field";
import PasswordInput from "@/components/auth/password-input";
import SupplierRegisterSuccess from "@/components/auth/supplier-register-success";
import TextArea from "@/components/auth/text-area";
import TextInput from "@/components/auth/text-input";

const INITIAL_STATE = { status: "idle", errors: {}, values: {} };

const SECTION_TITLE_CLASS =
  "text-xl font-semibold lg:text-[length:calc(28.4*var(--u))] lg:leading-[calc(43.2*var(--u))]";
const FIELD_LIST_CLASS = "mt-5 space-y-5 lg:mt-[calc(32.2*var(--u))] lg:space-y-[calc(22.3*var(--u))]";
const SECTION_GAP_CLASS = "mt-10 lg:mt-[calc(59*var(--u))]";
// Jarak setelah blok kategori sedikit lebih besar pada desain.
const ACCOUNT_SECTION_GAP_CLASS = "mt-10 lg:mt-[calc(61.6*var(--u))]";

// Form registrasi supplier. `categories` berisi opsi checkbox: [{ id, name }].
// Role dan status ("supplier", "Pending") TIDAK dikirim dari form; backend yang menentukan.
export default function SupplierRegisterForm({ categories }) {
  const [state, formAction, isPending] = useActionState(registerSupplierAction, INITIAL_STATE);
  const { errors = {}, values = {} } = state;

  if (state.status === "success") {
    return <SupplierRegisterSuccess />;
  }

  return (
    <form action={formAction} noValidate>
      <header className="mt-6 text-center lg:mt-[calc(18.4*var(--u))]">
        <h1 className="text-2xl font-semibold sm:text-3xl lg:text-[length:calc(33.6*var(--u))] lg:leading-[calc(51.3*var(--u))]">
          Buat Akun Supplier
        </h1>
        <p className="mt-2 text-base font-medium lg:mt-[calc(8.55*var(--u))] lg:text-[length:calc(19.7*var(--u))] lg:leading-[calc(29.55*var(--u))]">
          Daftarkan perusahaan Anda untuk menjadi Supplier AYVORA
        </p>
      </header>

      <section aria-labelledby="section-contact" className="mt-10 lg:mt-[calc(56.1*var(--u))]">
        <h2 id="section-contact" className={SECTION_TITLE_CLASS}>
          Informasi Kontak
        </h2>
        <div className={FIELD_LIST_CLASS}>
          <Field id="fullName" label="Nama Lengkap (penanggung jawab perusahaan)" error={errors.fullName}>
            <TextInput
              id="fullName"
              name="fullName"
              placeholder="Masukkan nama lengkap..."
              autoComplete="name"
              defaultValue={values.fullName}
              hasError={Boolean(errors.fullName)}
            />
          </Field>
          <Field id="email" label="Email" error={errors.email}>
            <TextInput
              id="email"
              name="email"
              type="email"
              placeholder="Masukkan email..."
              autoComplete="email"
              defaultValue={values.email}
              hasError={Boolean(errors.email)}
            />
          </Field>
          <Field id="phone" label="Nomor Telepon" error={errors.phone}>
            <TextInput
              id="phone"
              name="phone"
              type="tel"
              placeholder="Masukkan nomor telepon..."
              autoComplete="tel"
              defaultValue={values.phone}
              hasError={Boolean(errors.phone)}
            />
          </Field>
        </div>
      </section>

      <section aria-labelledby="section-company" className={SECTION_GAP_CLASS}>
        <h2 id="section-company" className={SECTION_TITLE_CLASS}>
          Informasi Perusahaan
        </h2>
        <div className={FIELD_LIST_CLASS}>
          <Field id="companyName" label="Nama Perusahaan" error={errors.companyName}>
            <TextInput
              id="companyName"
              name="companyName"
              placeholder="Masukkan nama perusahaan..."
              autoComplete="organization"
              defaultValue={values.companyName}
              hasError={Boolean(errors.companyName)}
            />
          </Field>
          <Field id="address" label="Alamat Perusahaan" error={errors.address}>
            <TextInput
              id="address"
              name="address"
              placeholder="Masukkan alamat perusahaan..."
              autoComplete="street-address"
              defaultValue={values.address}
              hasError={Boolean(errors.address)}
            />
          </Field>
          <Field id="businessField" label="Jenis Usaha" error={errors.businessField}>
            <TextInput
              id="businessField"
              name="businessField"
              placeholder="Masukkan jenis usaha..."
              defaultValue={values.businessField}
              hasError={Boolean(errors.businessField)}
            />
          </Field>
          <Field id="websiteUrl" label="Website (opsional)" error={errors.websiteUrl}>
            <TextInput
              id="websiteUrl"
              name="websiteUrl"
              placeholder="https://perusahaan.co.id"
              autoComplete="url"
              defaultValue={values.websiteUrl}
              hasError={Boolean(errors.websiteUrl)}
            />
          </Field>
          <Field id="companyDescription" label="Deskripsi Perusahaan" error={errors.companyDescription}>
            <TextArea
              id="companyDescription"
              name="companyDescription"
              placeholder="Masukkan deskripsi perusahaan..."
              defaultValue={values.companyDescription}
              hasError={Boolean(errors.companyDescription)}
            />
          </Field>
        </div>

        <CategoryCheckboxGroup
          categories={categories}
          selectedIds={values.categoryIds}
          error={errors.categoryIds}
        />
      </section>

      <section aria-labelledby="section-account" className={ACCOUNT_SECTION_GAP_CLASS}>
        <h2 id="section-account" className={SECTION_TITLE_CLASS}>
          Konfirmasi Akun
        </h2>
        <div className={FIELD_LIST_CLASS}>
          <Field id="password" label="Buat Kata Sandi (min. 8 karakter, ada huruf besar, angka, dan simbol)" error={errors.password}>
            <PasswordInput
              id="password"
              name="password"
              placeholder="Masukkan kata sandi..."
              autoComplete="new-password"
              hasError={Boolean(errors.password)}
            />
          </Field>
          <Field id="confirmPassword" label="Konfirmasi Kata Sandi" error={errors.confirmPassword}>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Konfirmasi kata sandi..."
              autoComplete="new-password"
              hasError={Boolean(errors.confirmPassword)}
            />
          </Field>
        </div>
      </section>

      {/* Ruang di atas tombol (sesuai desain). Pesan error umum tampil di sini. */}
      <div className="flex min-h-8 items-center justify-center py-4 lg:h-[calc(75.9*var(--u))] lg:py-0">
        {state.message && (
          <p role="alert" className="text-center text-sm font-medium leading-snug text-destructive lg:text-[length:calc(15.5*var(--u))]">
            {state.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-field disabled:opacity-70 lg:h-[calc(70.3*var(--u))] lg:rounded-[calc(16*var(--u))] lg:text-[length:calc(22*var(--u))]"
      >
        {isPending ? "Memproses..." : "Buat Akun Supplier"}
      </button>
    </form>
  );
}
