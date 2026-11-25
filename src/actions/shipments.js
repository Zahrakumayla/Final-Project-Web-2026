"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, successState } from "@/lib/action-helpers";
import { deleteUploadedImage, isUploadedFile, saveImage } from "@/lib/upload";
import { parseAssignForm, parseShipForm } from "@/lib/validation/inbound";
import { assignInspection, markArrived, shipPurchaseOrder } from "@/services/shipments";

// Supplier: Kirim Barang ke Gudang (PO Confirmed)
export async function shipPurchaseOrderAction(_state, formData) {
  const { user, error } = await authorize("INBOUND_SHIP");
  if (error) return error;
  const id = formData.get("restockId");
  if (!isUuid(id)) return errorState("Pesanan tidak ditemukan.");
  const { values } = parseShipForm(formData);
  try {
    const outcome = await shipPurchaseOrder(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    revalidatePath(`/supplier/restock/${id}`);
    return successState(`Barang dikirim (${outcome.number}). Status pengiriman: In Transit.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

// Supplier: unggah foto bukti barang tiba -> Arrived. File yatim dihapus bila gagal.
export async function markArrivedAction(_state, formData) {
  const { user, error } = await authorize("INBOUND_SHIP");
  if (error) return error;
  const id = formData.get("shipmentId");
  if (!isUuid(id)) return errorState("Pengiriman tidak ditemukan.");
  const file = formData.get("photo");
  if (!isUploadedFile(file)) return errorState("Unggah foto bukti barang tiba.", { photo: "Foto bukti wajib diunggah." });
  const saved = await saveImage(file, "arrivals");
  if (saved.error) return errorState(saved.error, { photo: saved.error });
  try {
    const outcome = await markArrived(user, id, saved.url);
    if (!outcome.ok) {
      await deleteUploadedImage(saved.url);
      return errorState(outcome.message);
    }
    revalidatePath(`/supplier/restock/${outcome.restockId}`);
    revalidatePath("/supplier/claims");
    return successState(`Bukti kedatangan ${outcome.number} terkirim ke Manager.`);
  } catch (caught) {
    await deleteUploadedImage(saved.url);
    return errorState(databaseMessage(caught));
  }
}

// Manager: Perintahkan Pemeriksaan / ganti Staff
export async function assignInspectionAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_ASSIGN");
  if (error) return error;
  const id = formData.get("shipmentId");
  if (!isUuid(id)) return errorState("Pengiriman tidak ditemukan.");
  const { values, errors, ok } = parseAssignForm(formData);
  if (!ok) return errorState("Periksa kembali isian.", errors, values);
  try {
    const outcome = await assignInspection(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    revalidatePath(`/manager/shipments/${id}`);
    return successState(outcome.reassigned ? `${outcome.number} dialihkan ke ${outcome.staffName}.` : `Pemeriksaan ${outcome.number} ditugaskan ke ${outcome.staffName}.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}
