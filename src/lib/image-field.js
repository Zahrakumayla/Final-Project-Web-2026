import { deleteUploadedImage, isUploadedFile, saveImage } from "@/lib/upload";

// Mengolah input gambar pada form (unggah baru / hapus / biarkan).
// Mengembalikan { url, error, previousToDelete }:
//  - url: nilai image_url yang harus disimpan
//  - previousToDelete: file lama yang boleh dihapus SETELAH database berhasil diperbarui
export async function resolveImageField(formData, { field = "image", folder, currentUrl = null }) {
  const file = formData.get(field);
  const wantsRemove = formData.get(`remove_${field}`) === "1";

  if (isUploadedFile(file)) {
    const saved = await saveImage(file, folder);
    if (saved.error) return { url: currentUrl, error: saved.error };
    return { url: saved.url, newUpload: saved.url, previousToDelete: currentUrl };
  }
  if (wantsRemove) return { url: null, previousToDelete: currentUrl };
  return { url: currentUrl };
}

export { deleteUploadedImage };
