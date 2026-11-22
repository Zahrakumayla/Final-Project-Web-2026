import { FIELD_VARIANTS } from "@/components/auth/field-styles";

// Pembungkus satu field form: label di atas, kontrol di tengah, pesan error di bawah.
// `children` adalah kontrol (TextInput, TextArea, atau PasswordInput).
export default function Field({ id, label, error, variant = "register", children }) {
  return (
    <div>
      <label htmlFor={id} className={FIELD_VARIANTS[variant].label}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 pl-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
