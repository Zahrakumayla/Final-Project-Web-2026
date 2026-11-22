"use client";

import { useState } from "react";
import { FIELD_VARIANTS } from "@/components/auth/field-styles";
import { EyeClosedIcon, EyeOpenIcon } from "@/components/shared/icons";

// Input kata sandi dengan tombol tampil/sembunyikan.
// Perlu "use client" karena menyimpan state apakah password sedang terlihat.
export default function PasswordInput({ id, variant = "register", hasError = false, ...props }) {
  const [isVisible, setIsVisible] = useState(false);
  const styles = FIELD_VARIANTS[variant];

  return (
    <div className="relative">
      <input
        id={id}
        type={isVisible ? "text" : "password"}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${id}-error` : undefined}
        className={`${styles.control} ${styles.withIcon}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={isVisible}
        className={`absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-field-icon lg:size-[calc(32*var(--u))] ${styles.iconButton}`}
      >
        {isVisible ? (
          <EyeOpenIcon className="w-6 lg:w-[calc(28.3*var(--u))]" />
        ) : (
          <EyeClosedIcon className="w-6 lg:w-[calc(28.3*var(--u))]" />
        )}
      </button>
    </div>
  );
}
