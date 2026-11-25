import { FIELD_VARIANTS } from "@/components/auth/field-styles";

// Input teks biasa (email, nama, telepon, dll). Props lain diteruskan ke <input>.
export default function TextInput({ id, variant = "register", hasError = false, ...props }) {
  return (
    <input
      id={id}
      aria-invalid={hasError || undefined}
      aria-describedby={hasError ? `${id}-error` : undefined}
      className={FIELD_VARIANTS[variant].control}
      {...props}
    />
  );
}
