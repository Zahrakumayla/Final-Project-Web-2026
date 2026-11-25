import { readText } from "@/lib/validation/helpers";

export function parseCategoryForm(formData) {
  const values = { name: readText(formData, "name", 100), description: readText(formData, "description", 500) };
  const errors = {};
  if (!values.name) errors.name = "Nama kategori wajib diisi.";
  else if (values.name.length < 3) errors.name = "Nama kategori minimal 3 karakter.";
  if (!values.description) errors.description = "Deskripsi kategori wajib diisi.";
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
