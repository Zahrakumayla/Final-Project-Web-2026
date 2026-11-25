import { readText } from "@/lib/validation/helpers";
import { validateEmail, validatePasswordStrength } from "@/lib/validation/auth";

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
export const MANAGEABLE_ROLES = ["warehouse_manager", "warehouse_staff"];

// Admin membuat akun Manager / Staff
export function parseUserForm(formData) {
  const values = {
    fullName: readText(formData, "fullName", 120),
    email: readText(formData, "email", 150).toLowerCase(),
    phone: readText(formData, "phone", 25).replace(/[\s-]/g, ""),
    role: readText(formData, "role", 30),
  };
  const password = typeof formData.get("password") === "string" ? formData.get("password") : "";
  const errors = {};
  if (!values.fullName || values.fullName.length < 3) errors.fullName = "Nama lengkap minimal 3 karakter.";
  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;
  if (values.phone && !PHONE_PATTERN.test(values.phone)) errors.phone = "Nomor telepon 8-15 digit (boleh diawali +).";
  if (!MANAGEABLE_ROLES.includes(values.role)) errors.role = "Pilih peran Manajer Gudang atau Staf Gudang.";
  const passwordError = validatePasswordStrength(password);
  if (passwordError) errors.password = passwordError;
  return { values, password, errors, ok: Object.keys(errors).length === 0 };
}

export function parseResetPassword(formData) {
  const next = typeof formData.get("newPassword") === "string" ? formData.get("newPassword") : "";
  const confirm = formData.get("confirmPassword");
  const errors = {};
  const strength = validatePasswordStrength(next);
  if (strength) errors.newPassword = strength;
  else if (next !== confirm) errors.confirmPassword = "Konfirmasi kata sandi tidak sama.";
  return { password: next, errors, ok: Object.keys(errors).length === 0 };
}
