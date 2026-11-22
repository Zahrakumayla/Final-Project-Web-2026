import { toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";
import { listProductsForExport } from "@/services/products";
import { listSuppliersForExport } from "@/services/suppliers";
import { listRestockForExport } from "@/services/restock";
import { listTransactionsForExport } from "@/services/transactions";
import { listMovementsForExport } from "@/services/inventory";
import { query } from "@/lib/db";

const date = (value) => (value ? String(value).slice(0, 10) : "");

const COLUMNS = {
  products: [
    { label: "SKU", key: "sku" }, { label: "Nama", key: "product_name" }, { label: "Kategori", key: "category_name" }, { label: "Satuan", key: "unit" },
    { label: "Stok", key: "current_stock" }, { label: "Status stok", key: "stock_status" }, { label: "Stok minimum", key: "min_stock" }, { label: "Batas rendah", key: "low_stock" },
    { label: "Harga beli", key: "buy_price" }, { label: "Harga jual", key: "sell_price" }, { label: "Rak", key: "rack_codes" },
  ],
  categories: [{ label: "Kategori", key: "name" }, { label: "Deskripsi", key: "description" }, { label: "Produk aktif", key: "product_count" }],
  suppliers: [
    { label: "Perusahaan", key: "company_name" }, { label: "Penanggung jawab", key: "full_name" }, { label: "Email", key: "email" }, { label: "Telepon", key: "phone" },
    { label: "Kategori", key: "categories" }, { label: "Status", key: "supplier_status" }, { label: "Rating", key: "avg_rating" }, { label: "Jumlah rating", key: "rating_count" },
  ],
  restock: [
    { label: "No. PO", key: "po_number" }, { label: "Supplier", key: "supplier_company" }, { label: "Tanggal order", value: (r) => date(r.order_date) },
    { label: "Estimasi tiba", value: (r) => date(r.expected_delivery_date) }, { label: "Status", key: "status" }, { label: "Terlambat", value: (r) => (r.is_late ? "Ya" : "Tidak") },
    { label: "Jumlah produk", key: "item_count" }, { label: "Total unit", key: "total_quantity" },
  ],
  transactions: [
    { label: "No. Transaksi", key: "transaction_number" }, { label: "Tipe", value: (r) => (r.type === "INCOMING" ? "Masuk" : "Keluar") }, { label: "Tanggal", value: (r) => date(r.transaction_date) },
    { label: "Supplier / pelanggan", value: (r) => r.supplier_company ?? r.customer_name }, { label: "No. PO", key: "po_number" }, { label: "Status", key: "status" },
    { label: "Jumlah layak", key: "total_quantity" }, { label: "Jumlah rusak", key: "total_damaged" }, { label: "Dibuat oleh", key: "created_by_name" },
  ],
  movements: [
    { label: "Waktu", key: "created_at" }, { label: "SKU", key: "sku" }, { label: "Produk", key: "product_name" }, { label: "Jenis", key: "movement_type" },
    { label: "Rak", key: "rack_code" }, { label: "Perubahan", key: "quantity_change" }, { label: "Stok rak setelahnya", key: "quantity_after" }, { label: "Transaksi", key: "transaction_number" },
  ],
};

const PERMISSION = { products: "EXPORT_PRODUCTS", categories: "EXPORT_CATEGORIES", suppliers: "EXPORT_SUPPLIERS", restock: "EXPORT_RESTOCK", transactions: "EXPORT_TRANSACTIONS", movements: "INVENTORY_VIEW" };

async function categoryRows(search) {
  const q = (search.q ?? "").slice(0, 100);
  const { rows } = await query(
    `SELECT c.name, c.description, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active)::int AS product_count
     FROM categories c WHERE c.name ILIKE $1 ORDER BY c.name`,
    [`%${q.replace(/[\\%_]/g, "\\$&")}%`],
  );
  return rows;
}

// Mengembalikan { csv } | { forbidden: true } | null (resource tidak dikenal)
export async function getExport(user, resource, search) {
  if (!COLUMNS[resource]) return null;
  if (!can(user, PERMISSION[resource])) return { forbidden: true };

  let rows;
  if (resource === "products") rows = await listProductsForExport(search);
  else if (resource === "categories") rows = await categoryRows(search);
  else if (resource === "suppliers") rows = await listSuppliersForExport(search);
  else if (resource === "restock") rows = await listRestockForExport(user, search);
  else if (resource === "transactions") rows = await listTransactionsForExport(user, search, ["INCOMING", "OUTGOING"].includes(search.type) ? search.type : null);
  else rows = await listMovementsForExport(search);
  return { csv: toCsv(COLUMNS[resource], rows) };
}
