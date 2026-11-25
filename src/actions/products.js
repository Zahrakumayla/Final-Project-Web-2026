"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { deleteUploadedImage, resolveImageField } from "@/lib/image-field";
import { getHomePath } from "@/lib/permissions";
import { parseProductForm, toFormValues } from "@/lib/validation/product";
import { createProduct, deleteOrArchiveProduct, getProduct, restoreProduct, updateProduct } from "@/services/products";

const FOLDER = "products";

function duplicateSkuMessage(error) {
  if (error?.code === "23505") return "SKU sudah dipakai produk lain.";
  if (error?.code === "23514") return "Data tidak valid: pastikan stok rendah lebih besar dari stok minimum.";
  return null;
}

export async function createProductAction(_state, formData) {
  const { user, error } = await authorize("PRODUCT_MANAGE");
  if (error) return error;

  const { values, errors, ok } = parseProductForm(formData, "create");
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, toFormValues(values));

  const image = await resolveImageField(formData, { folder: FOLDER });
  if (image.error) return errorState("Gambar tidak valid.", { image: image.error }, toFormValues(values));
  if (!image.url) return errorState("Gambar produk wajib diunggah.", { image: "Gambar produk wajib diunggah (JPG atau PNG, maks 2 MB)." }, toFormValues(values));

  try {
    await createProduct(user, values, image.url);
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    const known = duplicateSkuMessage(caught);
    if (caught?.code === "23505") return errorState("Produk gagal disimpan.", { sku: known }, toFormValues(values));
    return errorState(known ?? databaseMessage(caught), {}, toFormValues(values));
  }

  await setFlash("success", `Produk ${values.name} berhasil ditambahkan.`);
  redirect(`${getHomePath(user.role)}/products`);
}

export async function updateProductAction(_state, formData) {
  const { user, error } = await authorize("PRODUCT_MANAGE");
  if (error) return error;

  const productId = formData.get("productId");
  if (!isUuid(productId)) return errorState("Produk tidak ditemukan.");
  const existing = await getProduct(productId);
  if (!existing) return errorState("Produk tidak ditemukan.");

  const { values, errors, ok } = parseProductForm(formData, "edit");
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, toFormValues(values));

  const image = await resolveImageField(formData, { folder: FOLDER, currentUrl: existing.image_url });
  if (image.error) return errorState("Gambar tidak valid.", { image: image.error }, toFormValues(values));
  if (!image.url) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState("Gambar produk wajib ada.", { image: "Produk harus memiliki gambar. Unggah gambar pengganti." }, toFormValues(values));
  }

  try {
    const updated = await updateProduct(user, productId, values, image.url);
    if (!updated) return errorState("Produk tidak ditemukan.");
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState(duplicateSkuMessage(caught) ?? databaseMessage(caught), {}, toFormValues(values));
  }
  if (image.previousToDelete) await deleteUploadedImage(image.previousToDelete);

  await setFlash("success", `Produk ${values.name} berhasil diperbarui.`);
  redirect(`${getHomePath(user.role)}/products/${productId}`);
}

// Dipakai ActionDialog: hapus bila belum pernah dipakai, kalau sudah pernah dipakai diarsipkan.
export async function deleteProductAction(_state, formData) {
  const { user, error } = await authorize("PRODUCT_MANAGE");
  if (error) return error;

  const productId = formData.get("productId");
  if (!isUuid(productId)) return errorState("Produk tidak ditemukan.");

  const current = await getProduct(productId);
  if (!current) return errorState("Produk tidak ditemukan.");
  // Produk yang masih punya stok butuh konfirmasi tambahan agar tidak terhapus tak sengaja.
  if (current.current_stock > 0 && formData.get("confirmStock") !== "yes") {
    return errorState(`Produk masih memiliki stok ${current.current_stock} ${current.unit}. Centang konfirmasi untuk melanjutkan.`);
  }

  try {
    const outcome = await deleteOrArchiveProduct(user, productId);
    if (outcome.result === "not_found") return errorState("Produk tidak ditemukan.");
    if (outcome.imageUrl) await deleteUploadedImage(outcome.imageUrl);
    await setFlash("success", outcome.result === "archived" ? `${outcome.name} sudah pernah dipakai pada transaksi, jadi diarsipkan (bukan dihapus).` : `Produk ${outcome.name} berhasil dihapus.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
  redirect(`${getHomePath(user.role)}/products`);
}

export async function restoreProductAction(_state, formData) {
  const { user, error } = await authorize("PRODUCT_MANAGE");
  if (error) return error;
  const productId = formData.get("productId");
  if (!isUuid(productId)) return errorState("Produk tidak ditemukan.");
  await restoreProduct(user, productId);
  revalidatePath(`${getHomePath(user.role)}/products`);
  return successState("Produk diaktifkan kembali.");
}
