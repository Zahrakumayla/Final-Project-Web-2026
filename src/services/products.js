import { query, withTransaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { WhereBuilder, pageInfo, readListParams } from "@/lib/list-params";

export const PRODUCT_FILTERS = ["category", "status", "archived"];

const SORTABLE = {
  name: "product_name",
  sku: "sku",
  category: "category_name",
  stock: "current_stock",
  price: "buy_price",
  status: "CASE stock_status WHEN 'Out of Stock' THEN 0 WHEN 'Severe' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END",
};

function buildProductFilter(params) {
  const where = new WhereBuilder();
  where.add(params.filters.archived === "1" ? "NOT is_active" : "is_active");
  where.search(["product_name", "sku", "category_name"], params.q);
  if (params.filters.category) where.addWith("category_id = ?", params.filters.category);
  if (["Out of Stock", "Severe", "Low", "Normal"].includes(params.filters.status)) where.addWith("stock_status = ?", params.filters.status);
  return where;
}

export async function listProducts(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "name", filters: PRODUCT_FILTERS });
  // category harus UUID agar query tidak error
  if (params.filters.category && !/^[0-9a-f-]{36}$/i.test(params.filters.category)) params.filters.category = "";
  const where = buildProductFilter(params);

  const total = (await query(`SELECT COUNT(*) AS total FROM v_product_stock ${where.sql}`, where.values)).rows[0].total;
  const limit = where.param(params.pageSize);
  const offset = where.param(params.offset);
  const { rows } = await query(
    `SELECT * FROM v_product_stock ${where.sql} ORDER BY ${params.orderBy}, sku ASC LIMIT ${limit} OFFSET ${offset}`,
    where.values,
  );
  return { rows, params, info: pageInfo(params, total) };
}

// Semua produk sesuai filter (untuk ekspor CSV), tanpa pagination.
export async function listProductsForExport(searchParams) {
  const params = readListParams(searchParams, { sortable: SORTABLE, defaultSort: "name", filters: PRODUCT_FILTERS });
  const where = buildProductFilter(params);
  const { rows } = await query(`SELECT * FROM v_product_stock ${where.sql} ORDER BY ${params.orderBy}, sku ASC`, where.values);
  return rows;
}

export async function getProduct(productId) {
  const { rows } = await query("SELECT * FROM v_product_stock WHERE product_id = $1", [productId]);
  const product = rows[0];
  if (!product) return null;

  const [locations, recent] = await Promise.all([
    query(
      `SELECT r.id AS rack_id, r.rack_code, r.area, pl.quantity
       FROM product_locations pl JOIN racks r ON r.id = pl.rack_id
       WHERE pl.product_id = $1 ORDER BY r.rack_code`,
      [productId],
    ),
    // 5 pergerakan stok terakhir produk ini (masuk dari pemeriksaan / keluar ke pelanggan)
    query(
      `SELECT sm.id, sm.movement_type, sm.quantity_before, sm.quantity_change, sm.quantity_after, sm.created_at, r.rack_code,
              COALESCE(o.order_number, ins.inspection_number, 'Stok awal') AS source_number, ro.po_number, u.full_name AS created_by_name
       FROM stock_movements sm
       LEFT JOIN racks r ON r.id = sm.rack_id
       LEFT JOIN inspections ins ON ins.id = sm.inspection_id
       LEFT JOIN outbound_orders o ON o.id = sm.outbound_order_id
       LEFT JOIN restock_orders ro ON ro.id = sm.restock_order_id
       LEFT JOIN users u ON u.id = sm.created_by
       WHERE sm.product_id = $1
       ORDER BY sm.created_at DESC LIMIT 5`,
      [productId],
    ),
  ]);
  return { ...product, locations: locations.rows, recentMovements: recent.rows };
}

export async function listRacks() {
  const { rows } = await query(
    `SELECT r.id, r.rack_code, r.area, COALESCE(SUM(pl.quantity), 0)::int AS stored, COUNT(pl.product_id) FILTER (WHERE pl.quantity > 0)::int AS product_count
     FROM racks r LEFT JOIN product_locations pl ON pl.rack_id = r.id GROUP BY r.id ORDER BY r.rack_code`,
  );
  return rows;
}

export async function listActiveProducts() {
  const { rows } = await query("SELECT product_id, sku, product_name, unit, category_id, buy_price, current_stock, available_stock, stock_status FROM v_product_stock WHERE is_active ORDER BY product_name");
  return rows;
}

// Produk membuat stok awal HANYA saat dibuat (dicatat sebagai OPENING).
// Setelah itu stok hanya berubah lewat persetujuan pemeriksaan (masuk) dan barang keluar Shipped.
export async function createProduct(user, values, imageUrl) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO products (sku, name, category_id, description, buy_price, sell_price, min_stock, low_stock, unit, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [values.sku, values.name, values.categoryId, values.description || null, values.buyPrice, values.sellPrice, values.minStock, values.lowStock, values.unit, imageUrl],
    );
    const productId = rows[0].id;

    if (values.initialStock > 0) {
      await client.query("INSERT INTO product_locations (product_id, rack_id, quantity) VALUES ($1,$2,$3)", [productId, values.rackId, values.initialStock]);
      await client.query(
        `INSERT INTO stock_movements (product_id, rack_id, movement_type, quantity_before, quantity_change, quantity_after, created_by, notes)
         VALUES ($1,$2,'OPENING',0,$3,$3,$4,'Stok awal')`,
        [productId, values.rackId, values.initialStock, user.id],
      );
    }
    await logActivity(user.id, "Tambah produk", { description: `${values.sku} - ${values.name}`, entityType: "product", entityId: productId }, client);
    return productId;
  });
}

// SKU dan stok TIDAK ikut diperbarui: SKU permanen, stok hanya berubah lewat transaksi.
export async function updateProduct(user, productId, values, imageUrl) {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE products SET name=$2, category_id=$3, description=$4, buy_price=$5, sell_price=$6,
              min_stock=$7, low_stock=$8, unit=$9, image_url=$10
       WHERE id=$1`,
      [productId, values.name, values.categoryId, values.description || null, values.buyPrice, values.sellPrice, values.minStock, values.lowStock, values.unit, imageUrl],
    );
    if (!rowCount) return false;
    await logActivity(user.id, "Ubah produk", { description: values.name, entityType: "product", entityId: productId }, client);
    return true;
  });
}

// Hapus permanen bila produk belum pernah dipakai di transaksi/PO/laporan masalah.
// Jika sudah pernah dipakai, produk diarsipkan (is_active = false) agar riwayat tetap utuh.
export async function deleteOrArchiveProduct(user, productId) {
  return withTransaction(async (client) => {
    const found = (await client.query("SELECT sku, name, image_url FROM products WHERE id = $1 FOR UPDATE", [productId])).rows[0];
    if (!found) return { result: "not_found" };

    const used = (
      await client.query(
        `SELECT (SELECT COUNT(*) FROM restock_order_items WHERE product_id = $1)
              + (SELECT COUNT(*) FROM outbound_order_items WHERE product_id = $1)
              + (SELECT COUNT(*) FROM claims WHERE product_id = $1 OR actual_product_id = $1)
              + (SELECT COUNT(*) FROM stock_movements WHERE product_id = $1 AND movement_type <> 'OPENING') AS total`,
        [productId],
      )
    ).rows[0].total;

    if (used > 0) {
      await client.query("UPDATE products SET is_active = FALSE WHERE id = $1", [productId]);
      await logActivity(user.id, "Arsipkan produk", { description: `${found.sku} - ${found.name}`, entityType: "product", entityId: productId }, client);
      return { result: "archived", name: found.name };
    }
    await client.query("DELETE FROM products WHERE id = $1", [productId]);
    await logActivity(user.id, "Hapus produk", { description: `${found.sku} - ${found.name}`, entityType: "product" }, client);
    return { result: "deleted", name: found.name, imageUrl: found.image_url };
  });
}

export async function restoreProduct(user, productId) {
  const { rowCount } = await query("UPDATE products SET is_active = TRUE WHERE id = $1 AND NOT is_active", [productId]);
  if (rowCount) await logActivity(user.id, "Aktifkan produk", { entityType: "product", entityId: productId });
  return rowCount > 0;
}

export async function getProductStockTotal(productId) {
  const { rows } = await query("SELECT COALESCE(SUM(quantity),0) AS total FROM product_locations WHERE product_id = $1", [productId]);
  return rows[0].total;
}
