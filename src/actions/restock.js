"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { getHomePath } from "@/lib/permissions";
import { parseRestockForm } from "@/lib/validation/restock";
import { readText } from "@/lib/validation/helpers";
import { createRestock, deleteRestock, respondToRestock } from "@/services/restock";

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


export async function deleteRestockAction(_state, formData) {
  const { user, error } = await authorize("RESTOCK_DELETE");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("PO tidak ditemukan.");
  try {
    const outcome = await deleteRestock(user, id);
    if (!outcome.ok) return errorState(outcome.message);
    await setFlash("success", `PO ${outcome.poNumber} berhasil dihapus.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
  redirect("/manager/restock");
}
