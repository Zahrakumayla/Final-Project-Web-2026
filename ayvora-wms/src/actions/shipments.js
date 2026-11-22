"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, successState } from "@/lib/action-helpers";
import { parseShipmentForm } from "@/lib/validation/shipment";
import { updateShipment } from "@/services/shipments";

export async function updateShipmentAction(_state, formData) {
  const { user, error } = await authorize("SHIPMENT_MANAGE");
  if (error) return error;
  const id = formData.get("shipmentId");
  if (!isUuid(id)) return errorState("Pengiriman tidak ditemukan.");
  const { values, errors, ok } = parseShipmentForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  try {
    const outcome = await updateShipment(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, outcome.field ? { [outcome.field]: outcome.message } : {}, values);
    revalidatePath(`/staff/deliveries/${id}`);
    return successState(`Pengiriman ${outcome.number} diperbarui.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}
