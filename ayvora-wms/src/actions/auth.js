"use server";

import { redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/config";
import { getHomePath } from "@/lib/permissions";
import { endSession } from "@/lib/auth/session";
import { login, registerSupplier } from "@/lib/auth/service";
import { LOGIN_PATH } from "@/lib/constants";
import { toSafeValues, validateLogin, validateSupplierRegistration } from "@/lib/validation/auth";

// Server Action untuk form di browser. State yang dikembalikan: { status, message?, errors, values }.

export async function loginAction(_previousState, formData) {
  const { data, errors } = validateLogin(formData);
  const values = { email: data.email };

  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  let result;
  try {
    result = await login(data.email.toLowerCase(), data.password);
  } catch (error) {
    console.error("loginAction gagal:", error);
    return { status: "error", message: AUTH_MESSAGES.SERVER_ERROR, errors: {}, values };
  }

  if (!result.ok) return { status: "error", message: result.message, errors: {}, values };

  // redirect() melempar error khusus, jadi harus di luar try/catch.
  redirect(getHomePath(result.user.role));
}

export async function registerSupplierAction(_previousState, formData) {
  const { data, errors } = validateSupplierRegistration(formData);
  const values = toSafeValues(data);

  if (Object.keys(errors).length > 0) return { status: "error", errors, values };

  try {
    const result = await registerSupplier(data);
    if (!result.ok) return { status: "error", errors: result.errors, values };
  } catch (error) {
    console.error("registerSupplierAction gagal:", error);
    return { status: "error", message: AUTH_MESSAGES.SERVER_ERROR, errors: {}, values };
  }

  return { status: "success", errors: {}, values: {} };
}

export async function logoutAction() {
  await endSession();
  redirect(LOGIN_PATH);
}
