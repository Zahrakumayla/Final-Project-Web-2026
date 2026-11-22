import { FIELD_VARIANTS } from "@/components/auth/field-styles";

// Textarea untuk deskripsi perusahaan. Tinggi mengikuti desain (sekitar 240px di desktop).
export default function TextArea({ id, variant = "register", hasError = false, ...props }) {
  return (
    <textarea
      id={id}
      aria-invalid={hasError || undefined}
      aria-describedby={hasError ? `${id}-error` : undefined}
      className={`${FIELD_VARIANTS[variant].control} h-44 resize-y py-3 leading-normal lg:h-[calc(239.8*var(--u))] lg:resize-none lg:pt-[calc(16.3*var(--u))]`}
      {...props}
    />
  );
}
