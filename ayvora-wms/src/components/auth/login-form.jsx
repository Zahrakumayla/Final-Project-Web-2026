"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/actions/auth";
import Field from "@/components/auth/field";
import PasswordInput from "@/components/auth/password-input";
import TextInput from "@/components/auth/text-input";
import { REGISTER_SUPPLIER_PATH } from "@/lib/constants";

const INITIAL_STATE = { status: "idle", errors: {}, values: {} };

// Isi kartu Login. Satu form untuk semua role: role TIDAK dipilih di sini,
// melainkan dibaca backend dari database setelah email & password diverifikasi.
export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);
  const { errors = {}, values = {} } = state;

  return (
    <form action={formAction} noValidate>
      <h1 className="text-center text-2xl font-semibold lg:mt-[calc(3.3*var(--u))] lg:text-[length:calc(31.1*var(--u))] lg:leading-[calc(47.25*var(--u))]">
        Masuk ke Akun Anda
      </h1>

      <div className="mt-8 space-y-5 lg:mt-[calc(57*var(--u))] lg:space-y-[calc(32.5*var(--u))]">
        <Field id="email" label="Email" variant="login" error={errors.email}>
          <TextInput
            id="email"
            name="email"
            type="email"
            variant="login"
            placeholder="Masukkan email..."
            autoComplete="email"
            defaultValue={values.email}
            hasError={Boolean(errors.email)}
          />
        </Field>

        <Field id="password" label="Kata Sandi" variant="login" error={errors.password}>
          <PasswordInput
            id="password"
            name="password"
            variant="login"
            placeholder="Masukkan kata sandi..."
            autoComplete="current-password"
            hasError={Boolean(errors.password)}
          />
        </Field>
      </div>

      {/* Ruang antara input dan tombol (sesuai desain). Pesan error umum tampil di sini. */}
      <div className="flex min-h-6 items-center justify-center py-3 lg:h-[calc(70.3*var(--u))] lg:py-0">
        {state.message && (
          <p role="alert" className="text-center text-sm font-medium leading-snug text-destructive lg:text-[length:calc(15.5*var(--u))]">
            {state.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-field disabled:opacity-70 lg:h-[calc(70.3*var(--u))] lg:rounded-[calc(16*var(--u))] lg:text-[length:calc(22*var(--u))]"
      >
        {isPending ? "Memproses..." : "Masuk"}
      </button>

      <p className="mt-6 text-center text-base lg:mt-[calc(57.7*var(--u))] lg:text-[length:calc(17.4*var(--u))] lg:leading-[calc(29.1*var(--u))]">
        Belum punya akun Supplier?{" "}
        <Link href={REGISTER_SUPPLIER_PATH} className="font-bold">
          Daftar
        </Link>
      </p>
    </form>
  );
}
