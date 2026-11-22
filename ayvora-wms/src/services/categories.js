import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

const SORTABLE = { name: "c.name", products: "product_count", date: "c.created_at" };

export async function listCategories(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "name" });
  const where = new WhereBuilder().search(["c.name", "c.description"], params.q);
  const total = (await query(`SELECT COUNT(*) AS total FROM categories c ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(
    `SELECT c.id, c.name, c.description, c.image_url, c.created_at,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active)::int AS product_count
     FROM categories c ${where.sql} ORDER BY ${params.orderBy}, c.name LIMIT ${limit} OFFSET ${offset}`,
    where.values,
  );
  return { rows, params, info: pageInfo(params, total) };
}

export async function listAllCategories() {
  const { rows } = await query("SELECT id, name FROM categories ORDER BY name");
  return rows;
}

export async function getCategory(categoryId) {
  const { rows } = await query("SELECT id, name, description, image_url FROM categories WHERE id = $1", [categoryId]);
  return rows[0] ?? null;
}

export async function createCategory(user, values, imageUrl) {
  return withTransaction(async (client) => {
    const { rows } = await client.query("INSERT INTO categories (name, description, image_url) VALUES ($1,$2,$3) RETURNING id", [values.name, values.description || null, imageUrl]);
    await logActivity(user.id, "Tambah kategori", { description: values.name, entityType: "category", entityId: rows[0].id }, client);
    return rows[0].id;
  });
}

export async function updateCategory(user, categoryId, values, imageUrl) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query("UPDATE categories SET name=$2, description=$3, image_url=$4 WHERE id=$1", [categoryId, values.name, values.description || null, imageUrl]);
    if (!rowCount) return false;
    await logActivity(user.id, "Ubah kategori", { description: values.name, entityType: "category", entityId: categoryId }, client);
    return true;
  });
}

// Kategori yang masih dipakai produk atau supplier tidak boleh dihapus.
export async function deleteCategory(user, categoryId) {
  return withTransaction(async (client) => {
    const found = (await client.query("SELECT name, image_url FROM categories WHERE id = $1 FOR UPDATE", [categoryId])).rows[0];
    if (!found) return { result: "not_found" };
    const usage = (
      await client.query(
        `SELECT (SELECT COUNT(*) FROM products WHERE category_id = $1) AS products,
                (SELECT COUNT(*) FROM supplier_categories WHERE category_id = $1) AS suppliers`,
        [categoryId],
      )
    ).rows[0];
    if (usage.products > 0) return { result: "in_use", reason: `Kategori masih dipakai oleh ${usage.products} produk. Pindahkan atau hapus produknya terlebih dahulu.` };
    if (usage.suppliers > 0) return { result: "in_use", reason: `Kategori masih dipilih oleh ${usage.suppliers} supplier, sehingga tidak dapat dihapus.` };
    await client.query("DELETE FROM categories WHERE id = $1", [categoryId]);
    await logActivity(user.id, "Hapus kategori", { description: found.name, entityType: "category" }, client);
    return { result: "deleted", name: found.name, imageUrl: found.image_url };
  });
}
