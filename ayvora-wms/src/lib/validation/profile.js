import { readText } from "@/lib/validation/helpers";
import { validatePasswordStrength } from "@/lib/validation/auth";

const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

export function parseProfileForm(formData, role) {
  const values = { fullName: readText(formData, "fullName", 120), phone: readText(formData, "phone", 25).replace(/[\s-]/g, "") };
  if (role === "supplier") {
    values.companyName = readText(formData, "companyName", 150);
    values.businessField = readText(formData, "businessField", 150);
    values.address = readText(formData, "address", 500);
    values.websiteUrl = readText(formData, "websiteUrl", 200);
    values.companyDescription = readText(formData, "companyDescription", 1000);
  }
  const errors = {};
  if (!values.fullName) errors.fullName = "Nama lengkap wajib diisi.";
  if (values.phone && !PHONE_PATTERN.test(values.phone)) errors.phone = "Nomor telepon 8-15 digit (boleh diawali +).";
  if (role === "supplier") {
    if (!values.companyName) errors.companyName = "Nama perusahaan wajib diisi.";
    if (values.websiteUrl && !/^https?:\/\/[^\s]+$/i.test(values.websiteUrl)) errors.websiteUrl = "Website harus diawali http:// atau https://";
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}

export function parsePasswordForm(formData) {
  const current = formData.get("currentPassword");
  const next = formData.get("newPassword");
  const confirm = formData.get("confirmPassword");
  const errors = {};
  if (typeof current !== "string" || !current) errors.currentPassword = "Kata sandi saat ini wajib diisi.";
  const strength = validatePasswordStrength(typeof next === "string" ? next : "");
  if (strength) errors.newPassword = strength;
  else if (next === current) errors.newPassword = "Kata sandi baru tidak boleh sama dengan yang lama.";
  if (next !== confirm) errors.confirmPassword = "Konfirmasi kata sandi tidak sama.";
  return { values: { current, next }, errors, ok: Object.keys(errors).length === 0 };
}
