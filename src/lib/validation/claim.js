import { readText } from "@/lib/validation/helpers";

export function parseRefundForm(formData) {
  const values = { amount: readText(formData, "amount", 15), reference: readText(formData, "reference", 150) };
  const errors = {};
  const amount = /^\d{1,12}$/.test(values.amount) ? Number(values.amount) : Number.NaN;
  if (Number.isNaN(amount) || amount <= 0) errors.amount = "Isi nominal refund dalam rupiah (angka bulat, lebih dari 0).";
  if (!values.reference) errors.reference = "Isi nomor referensi transfer / bukti refund.";
  return { values: { ...values, amountValue: amount }, errors, ok: Object.keys(errors).length === 0 };
}

export function parseReplacementForm(formData) {
  return {
    values: {
      courierName: readText(formData, "courierName", 100),
      trackingNumber: readText(formData, "trackingNumber", 100),
      notes: readText(formData, "notes", 1000),
    },
    errors: {},
    ok: true,
  };
}

export function readReason(formData, field = "reason", max = 1000) {
  return readText(formData, field, max);
}

export function readResolution(formData) {
  const value = readText(formData, "resolution", 20);
  return ["Replacement", "Refund"].includes(value) ? value : null;
}
