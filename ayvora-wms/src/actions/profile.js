"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, successState } from "@/lib/action-helpers";
import { readSessionToken } from "@/lib/auth/session";
import { deleteUploadedImage, resolveImageField } from "@/lib/image-field";
import { getHomePath } from "@/lib/permissions";
import { parsePasswordForm, parseProfileForm } from "@/lib/validation/profile";
import { changePassword, getProfile, updateProfile } from "@/services/profile";

export async function updateProfileAction(_state, formData) {
  const { user, error } = await authorize("PROFILE_EDIT");
  if (error) return error;
  const { values, errors, ok } = parseProfileForm(formData, user.role);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);

  const existing = await getProfile(user.id);
  const image = await resolveImageField(formData, { field: "image", folder: "avatars", currentUrl: existing.avatar_url });
  if (image.error) return errorState("Foto tidak valid.", { image: image.error }, values);
  try {
    await updateProfile(user, values, image.url);
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState(databaseMessage(caught), {}, values);
  }
  if (image.previousToDelete) await deleteUploadedImage(image.previousToDelete);
  revalidatePath(`${getHomePath(user.role)}/profile`);
  return successState("Profil berhasil diperbarui.");
}

export async function changePasswordAction(_state, formData) {
  const { user, error } = await authorize("PROFILE_EDIT");
  if (error) return error;
  const { values, errors, ok } = parsePasswordForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors);
  try {
    const outcome = await changePassword(user, await readSessionToken(), values);
    if (!outcome.ok) return errorState(outcome.message, { [outcome.field]: outcome.message });
    return successState("Kata sandi diganti. Perangkat lain telah dikeluarkan.");
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
