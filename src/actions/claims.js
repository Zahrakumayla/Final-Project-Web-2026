"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, successState } from "@/lib/action-helpers";
import { deleteUploadedImage, isUploadedFile, saveImage } from "@/lib/upload";
import { parseRefundForm, parseReplacementForm, readReason, readResolution } from "@/lib/validation/claim";
import { requestResolution, sendReplacement, submitRefund, verifyRefund } from "@/services/claims";

const refresh = (id) => {
  revalidatePath(`/supplier/claims/${id}`);
  revalidatePath(`/manager/claims/${id}`);
};

async function claimId(formData) {
  const id = formData.get("claimId");
  return isUuid(id) ? id : null;
}

export async function sendReplacementAction(_state, formData) {
  const { user, error } = await authorize("CLAIM_RESPOND");
  if (error) return error;
  const id = await claimId(formData);
  if (!id) return errorState("Klaim tidak ditemukan.");
  const { values } = parseReplacementForm(formData);
  try {
    const outcome = await sendReplacement(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    refresh(id);
    return successState(`Barang pengganti dikirim (${outcome.number}). Unggah foto saat barang tiba di gudang.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

export async function submitRefundAction(_state, formData) {
  const { user, error } = await authorize("CLAIM_RESPOND");
  if (error) return error;
  const id = await claimId(formData);
  if (!id) return errorState("Klaim tidak ditemukan.");
  const { values, errors, ok } = parseRefundForm(formData);
  const file = formData.get("proof");
  if (!isUploadedFile(file)) errors.proof = "Unggah bukti refund (foto / tangkapan layar transfer).";
  if (!ok || errors.proof) return errorState("Periksa kembali isian refund.", errors, values);
  const saved = await saveImage(file, "refunds");
  if (saved.error) return errorState(saved.error, { proof: saved.error }, values);
  try {
    const outcome = await submitRefund(user, id, values, saved.url);
    if (!outcome.ok) {
      await deleteUploadedImage(saved.url);
      return errorState(outcome.message, {}, values);
    }
    if (outcome.previousProof) await deleteUploadedImage(outcome.previousProof);
    refresh(id);
    return successState(`Refund ${outcome.number} diajukan. Menunggu verifikasi Manager.`);
  } catch (caught) {
    await deleteUploadedImage(saved.url);
    return errorState(databaseMessage(caught), {}, values);
  }
}

async function verify(formData, valid) {
  const { user, error } = await authorize("CLAIM_DECIDE");
  if (error) return error;
  const id = await claimId(formData);
  if (!id) return errorState("Klaim tidak ditemukan.");
  const reason = readReason(formData);
  if (!valid && !reason) return errorState("Alasan bukti tidak valid wajib diisi.", { reason: "Alasan wajib diisi." });
  try {
    const outcome = await verifyRefund(user, id, valid, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(valid ? `${outcome.number} selesai (Resolved).` : `Supplier diminta mengunggah ulang bukti ${outcome.number}.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
export const refundValidAction = async (_s, formData) => verify(formData, true);
export const refundInvalidAction = async (_s, formData) => verify(formData, false);

// Manager: pilih penyelesaian klaim (barang pengganti atau refund) untuk Supplier
export async function requestResolutionAction(_state, formData) {
  const { user, error } = await authorize("CLAIM_DECIDE");
  if (error) return error;
  const id = await claimId(formData);
  if (!id) return errorState("Klaim tidak ditemukan.");
  const resolution = readResolution(formData);
  if (!resolution) return errorState("Pilihan penyelesaian tidak valid.");
  const note = readReason(formData);
  try {
    const outcome = await requestResolution(user, id, resolution, note);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`Permintaan ${outcome.label} untuk ${outcome.number} dikirim ke Supplier.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
