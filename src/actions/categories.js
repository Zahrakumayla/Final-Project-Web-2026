"use server";

import { redirect } from "next/navigation";
import { authorize, databaseMessage, errorState, isUuid, setFlash } from "@/lib/action-helpers";
import { deleteUploadedImage, resolveImageField } from "@/lib/image-field";
import { getHomePath } from "@/lib/permissions";
import { parseCategoryForm } from "@/lib/validation/category";
import { categoryNameTaken, createCategory, deleteCategory, getCategory, updateCategory } from "@/services/categories";

const FOLDER = "categories";
const DUPLICATE = "Nama kategori sudah dipakai.";

export async function createCategoryAction(_state, formData) {
  const { user, error } = await authorize("CATEGORY_MANAGE");
  if (error) return error;

  const { values, errors, ok } = parseCategoryForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  if (await categoryNameTaken(values.name)) return errorState("Kategori gagal disimpan.", { name: DUPLICATE }, values);
  const image = await resolveImageField(formData, { folder: FOLDER });
  if (image.error) return errorState("Gambar tidak valid.", { image: image.error }, values);
  if (!image.url) return errorState("Gambar kategori wajib diunggah.", { image: "Gambar kategori wajib diunggah (JPG atau PNG, maks 2 MB)." }, values);

  try {
    await createCategory(user, values, image.url);
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    if (caught?.code === "23505") return errorState("Kategori gagal disimpan.", { name: DUPLICATE }, values);
    return errorState(databaseMessage(caught), {}, values);
  }
  await setFlash("success", `Kategori ${values.name} berhasil ditambahkan.`);
  redirect(`${getHomePath(user.role)}/categories`);
}

export async function updateCategoryAction(_state, formData) {
  const { user, error } = await authorize("CATEGORY_MANAGE");
  if (error) return error;

  const categoryId = formData.get("categoryId");
  if (!isUuid(categoryId)) return errorState("Kategori tidak ditemukan.");
  const existing = await getCategory(categoryId);
  if (!existing) return errorState("Kategori tidak ditemukan.");

  const { values, errors, ok } = parseCategoryForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  if (await categoryNameTaken(values.name, categoryId)) return errorState("Kategori gagal disimpan.", { name: DUPLICATE }, values);
  const image = await resolveImageField(formData, { folder: FOLDER, currentUrl: existing.image_url });
  if (image.error) return errorState("Gambar tidak valid.", { image: image.error }, values);
  if (!image.url) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState("Gambar kategori wajib ada.", { image: "Kategori harus memiliki gambar. Unggah gambar pengganti." }, values);
  }

  try {
    await updateCategory(user, categoryId, values, image.url);
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    if (caught?.code === "23505") return errorState("Kategori gagal disimpan.", { name: DUPLICATE }, values);
    return errorState(databaseMessage(caught), {}, values);
  }
  if (image.previousToDelete) await deleteUploadedImage(image.previousToDelete);
  await setFlash("success", `Kategori ${values.name} berhasil diperbarui.`);
  redirect(`${getHomePath(user.role)}/categories`);
}

export async function deleteCategoryAction(_state, formData) {
  const { user, error } = await authorize("CATEGORY_MANAGE");
  if (error) return error;
  const categoryId = formData.get("categoryId");
  if (!isUuid(categoryId)) return errorState("Kategori tidak ditemukan.");

  try {
    const outcome = await deleteCategory(user, categoryId);
    if (outcome.result === "not_found") return errorState("Kategori tidak ditemukan.");
    if (outcome.result === "in_use") return errorState(outcome.reason);
    if (outcome.imageUrl) await deleteUploadedImage(outcome.imageUrl);
    await setFlash("success", `Kategori ${outcome.name} berhasil dihapus.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
  redirect(`${getHomePath(user.role)}/categories`);
}
