import { readText } from "@/lib/validation/helpers";
import { isValidDate } from "@/lib/validation/restock";

export const SHIPMENT_STATUSES = ["Waiting", "Preparing", "Ready to Ship", "Shipped", "Delivered", "Delivery Issue"];

export function parseShipmentForm(formData) {
  const values = {
    status: readText(formData, "status", 20),
    courierName: readText(formData, "courierName", 100),
    trackingNumber: readText(formData, "trackingNumber", 100),
    estimatedDate: readText(formData, "estimatedDate", 10),
    notes: readText(formData, "notes", 1000),
  };
  const errors = {};
  if (values.status && !SHIPMENT_STATUSES.includes(values.status)) errors.status = "Status tidak valid.";
  if (values.estimatedDate && !isValidDate(values.estimatedDate)) errors.estimatedDate = "Format tanggal tidak valid.";
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
