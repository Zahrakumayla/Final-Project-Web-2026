"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { getHomePath } from "@/lib/permissions";
import { parseDeliveryForm, parseRating, parseRestockForm } from "@/lib/validation/restock";
import { readText } from "@/lib/validation/helpers";
import { advanceRestock, createRestock, getRestock, rateRestock, respondToRestock, updateDelivery } from "@/services/restock";

const refresh = (user, id) => revalidatePath(`${getHomePath(user.role)}/restock/${id}`);

export async function createRestockAction(_state, formData) {
  const { user, error } = await authorize("RESTOCK_CREATE");
  if (error) return error;
  const { values, errors, ok } = parseRestockForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  let outcome;
  try {
    outcome = await createRestock(user, values);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
  if (!outcome.ok) return errorState(outcome.message, {}, values);
  await setFlash("success", `PO ${outcome.poNumber} berhasil dibuat dan dikirim ke supplier.`);
  redirect(`/manager/restock/${outcome.id}`);
}

async function respond(formData, decision) {
  const { user, error } = await authorize("RESTOCK_RESPOND");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("Pesanan tidak ditemukan.");
  const reason = readText(formData, "reason", 500);
  if (decision === "reject" && !reason) return errorState("Alasan penolakan wajib diisi.", { reason: "Alasan penolakan wajib diisi." }, { reason });
  try {
    const outcome = await respondToRestock(user, id, decision, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(user, id);
    return successState(decision === "confirm" ? `PO ${outcome.poNumber} dikonfirmasi.` : `PO ${outcome.poNumber} ditolak.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
export const confirmRestockAction = async (_s, formData) => respond(formData, "confirm");
export const rejectRestockAction = async (_s, formData) => respond(formData, "reject");

export async function updateDeliveryAction(_state, formData) {
  const { user, error } = await authorize("RESTOCK_VIEW");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("Pesanan tidak ditemukan.");
  const order = await getRestock(user, id);
  if (!order) return errorState("Pesanan tidak ditemukan.");

  const { values, errors, changedEta, ok } = parseDeliveryForm(formData, { currentExpected: order.expected_delivery_date });
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  if (values.expectedDate && values.expectedDate < order.order_date) return errorState("Periksa kembali isian formulir.", { expectedDate: "Estimasi tidak boleh sebelum tanggal order." }, values);
  try {
    const outcome = await updateDelivery(user, id, values, changedEta);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    refresh(user, id);
    return successState("Info pengiriman disimpan.");
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

export async function advanceRestockAction(_state, formData) {
  const { user, error } = await authorize("RESTOCK_UPDATE_STATUS");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("Pesanan tidak ditemukan.");
  try {
    const outcome = await advanceRestock(user, id, readText(formData, "target", 20));
    if (!outcome.ok) return errorState(outcome.message);
    refresh(user, id);
    return successState(`PO ${outcome.poNumber} kini ${outcome.status}.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function rateRestockAction(_state, formData) {
  const { user, error } = await authorize("RESTOCK_RATE");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("Pesanan tidak ditemukan.");
  const { values, errors, ok } = parseRating(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, { feedback: values.feedback });
  try {
    const outcome = await rateRestock(user, id, values);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(user, id);
    return successState("Rating tersimpan. Terima kasih!");
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
