import { Badge } from "@/components/ui/badge";
import { SUPPLIER_STATUS_LABEL, statusLabel } from "@/lib/labels";

// Pemetaan status -> warna. Satu tempat agar warna status konsisten di seluruh aplikasi.
// Status stok: abu-abu (Out of Stock), merah (Severe), kuning (Low), hijau (Normal).

const STOCK = { "Out of Stock": "neutral", Severe: "danger", Low: "warning", Normal: "success" };
// Tahap PO gabungan: status PO -> pengiriman -> penerimaan
const RESTOCK = {
  Pending: "warning", Confirmed: "info", Rejected: "danger", "In Transit": "primary", Arrived: "primary",
  "Partially Received": "warning", Received: "success",
};
const SHIPMENT = { "In Transit": "primary", Arrived: "info" };
const INSPECTION = { "Awaiting Inspection": "warning", "Under Inspection": "info", "Not Found": "danger", "Inspection Completed": "success" };
const APPROVAL = { "Awaiting Approval": "warning", Approved: "success", "Revision Requested": "danger" };
const CLAIM = {
  "Claim Submitted": "warning", "Replacement In Transit": "primary", "Refund Processing": "info",
  Resolved: "success", "Claim Rejected": "neutral",
};
const OUTBOUND = { "Pending Approval": "warning", Approved: "info", Rejected: "danger", Preparing: "primary", Shipped: "success", Cancelled: "neutral" };
const SUPPLIER = { Pending: "warning", Approved: "success", Rejected: "danger" };

const make = (map, labels) =>
  function StatusBadge({ status, label, className }) {
    if (!status) return null;
    const text = labels ? labels[status] ?? status : statusLabel(status);
    return <Badge tone={map[status] ?? "neutral"} className={className}>{label ? `${label}: ${text}` : text}</Badge>;
  };

export const StockBadge = make(STOCK);
export const RestockBadge = make(RESTOCK);
export const ShipmentBadge = make(SHIPMENT);
export const InspectionBadge = make(INSPECTION);
export const ApprovalBadge = make(APPROVAL);
export const ClaimBadge = make(CLAIM);
export const OutboundBadge = make(OUTBOUND);
export const SupplierBadge = make(SUPPLIER, SUPPLIER_STATUS_LABEL);

export function LateBadge() {
  return <Badge tone="danger">Terlambat</Badge>;
}

export function ActiveBadge({ active }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? "Aktif" : "Nonaktif"}</Badge>;
}
