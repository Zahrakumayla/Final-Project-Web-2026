import { query } from "@/lib/db";

// Daftar kategori untuk checkbox form registrasi supplier.
export async function getCategories() {
  const { rows } = await query("SELECT id, name FROM categories ORDER BY name");
  return rows;
}
