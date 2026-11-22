import { Badge } from "@/components/ui/badge";

// Pemetaan status -> warna. Satu tempat agar warna status konsisten di seluruh aplikasi.
// Status stok sesuai tugas: abu-abu (Out of Stock), merah (Severe), kuning (Low), hijau (Normal).

const STOCK = { "Out of Stock": "neutral", Severe: "danger", Low: "warning", Normal: "success" };
const TRANSACTION = { Pending: "warning", Approved: "success", Rejected: "danger", Shipped: "info" };
const RESTOCK = { Pending: "warning", Confirmed: "info", Rejected: "danger", "In Transit": "primary", Received: "success" };
const DELIVERY = { Waiting: "neutral", Preparing: "warning", "Ready to Ship": "info", Shipped: "primary", Delivered: "success", "Delivery Issue": "danger" };
const SUPPLIER = { Pending: "warning", Approved: "success", Rejected: "danger" };
const REMEDY = { Requested: "warning", "In Progress": "info", Completed: "success" };
const ISSUE = { Open: "warning", "Under Review": "info", Resolved: "success", Dismissed: "neutral" };

const make = (map) =>
  function StatusBadge({ status, label, className }) {
    return <Badge tone={map[status] ?? "neutral"} className={className}>{label ? `${label}: ${status}` : status}</Badge>;
  };

export const StockBadge = make(STOCK);
export const TransactionBadge = make(TRANSACTION);
export const RestockBadge = make(RESTOCK);
export const DeliveryBadge = make(DELIVERY);
export const SupplierBadge = make(SUPPLIER);
export const IssueBadge = make(ISSUE);
export const RemedyBadge = make(REMEDY);

export function LateBadge() {
  return <Badge tone="danger">Terlambat</Badge>;
}
