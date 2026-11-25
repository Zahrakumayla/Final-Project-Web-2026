"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { parseResetPassword, parseUserForm } from "@/lib/validation/user";
import { createUser, resetUserPassword, setUserActive } from "@/services/users";

export async function createUserAction(_state, formData) {
  const { user, error } = await authorize("USER_MANAGE");
  if (error) return error;
  const { values, password, errors, ok } = parseUserForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  let outcome;
  try {
    outcome = await createUser(user, values, password);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
  if (!outcome.ok) return errorState("Periksa kembali isian formulir.", outcome.errors, values);
  await setFlash("success", `Akun ${values.fullName} berhasil dibuat.`);
  redirect(`/admin/users/${outcome.id}`);
}

async function toggle(formData, active) {
  const { user, error } = await authorize("USER_MANAGE");
  if (error) return error;
  const id = formData.get("userId");
  if (!isUuid(id)) return errorState("Pengguna tidak ditemukan.");
  if (id === user.id) return errorState("Anda tidak dapat menonaktifkan akun sendiri.");
  try {
    const outcome = await setUserActive(user, id, active);
    if (!outcome.ok) return errorState(outcome.message);
    revalidatePath(`/admin/users/${id}`);
    revalidatePath("/admin/users");
    return successState(`Akun ${outcome.name} ${active ? "diaktifkan" : "dinonaktifkan"}.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
export const activateUserAction = async (_s, formData) => toggle(formData, true);
export const deactivateUserAction = async (_s, formData) => toggle(formData, false);

export async function resetPasswordAction(_state, formData) {
  const { user, error } = await authorize("USER_MANAGE");
  if (error) return error;
  const id = formData.get("userId");
  if (!isUuid(id)) return errorState("Pengguna tidak ditemukan.");
  const { password, errors, ok } = parseResetPassword(formData);
  if (!ok) return errorState("Periksa kembali kata sandi baru.", errors);
  try {
    const outcome = await resetUserPassword(user, id, password);
    if (!outcome.ok) return errorState(outcome.message);
    return successState(`Kata sandi ${outcome.name} direset. Semua sesinya dicabut.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
