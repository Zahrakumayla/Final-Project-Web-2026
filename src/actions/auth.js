"use server";

import { redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/config";
import { getHomePath } from "@/lib/permissions";
import { endSession, startSession } from "@/lib/auth/session";
import { getApplicant, login, registerSupplier, resubmitSupplier } from "@/lib/auth/service";
import { LOGIN_PATH, STATUS_PATH } from "@/lib/constants";
import { toSafeValues, validateLogin, validateSupplierRegistration } from "@/lib/validation/auth";

// Server Action untuk form di browser. State yang dikembalikan: { status, message?, errors, values }.

export async function loginAction(_previousState, formData) {
  const { data, errors } = validateLogin(formData);
  const values = { email: data.email };

  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  let result;
  try {
    result = await login(data.email.toLowerCase(), data.password, { allowApplicant: true });
  } catch (error) {
    console.error("loginAction gagal:", error);
    return { status: "error", message: AUTH_MESSAGES.SERVER_ERROR, errors: {}, values };
  }

  if (!result.ok) return { status: "error", message: result.message, errors: {}, values };

  // redirect() melempar error khusus, jadi harus di luar try/catch.
  redirect(result.user.applicant ? STATUS_PATH : getHomePath(result.user.role));
}

export async function registerSupplierAction(_previousState, formData) {
  const { data, errors } = validateSupplierRegistration(formData);
  const values = toSafeValues(data);

  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  let newId;
  try {
    const result = await registerSupplier(data);
    if (!result.ok) return { status: "error", errors: result.errors, values };
    newId = result.id;
  } catch (error) {
    console.error("registerSupplierAction gagal:", error);
    return { status: "error", message: AUTH_MESSAGES.SERVER_ERROR, errors: {}, values };
  }

  // Langsung tampilkan halaman status "menunggu persetujuan" (sesi khusus pemohon, tanpa akses aplikasi).
  await startSession(newId);
  redirect(`${STATUS_PATH}?info=baru`);
}

// Supplier yang ditolak memperbaiki data lalu mengajukan ulang (akun yang sama, tanpa daftar baru).
export async function resubmitSupplierAction(_previousState, formData) {
  const applicant = await getApplicant();
  if (!applicant) redirect(LOGIN_PATH);

  // Memakai aturan validasi registrasi; email & kata sandi tidak diubah di sini.
  const { data, errors } = validateSupplierRegistration(formData);
  delete errors.email; delete errors.password; delete errors.confirmPassword;
  const values = toSafeValues(data);
  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  let result;
  try {
    result = await resubmitSupplier(applicant.id, data);
  } catch (error) {
    console.error("resubmitSupplierAction gagal:", error);
    return { status: "error", message: AUTH_MESSAGES.SERVER_ERROR, errors: {}, values };
  }
  if (!result.ok) return { status: "error", message: result.message, errors: result.errors ?? {}, values };
  redirect(`${STATUS_PATH}?info=ulang`);
}

export async function logoutAction() {
  await endSession();
  redirect(LOGIN_PATH);
}
