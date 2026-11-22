"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { deleteUploadedImage, resolveImageField } from "@/lib/image-field";
import { getHomePath } from "@/lib/permissions";
import { parseIssueForm, parseRemedyComplete, parseRemedyRequest, parseRemedyResponse, parseResolution } from "@/lib/validation/issue";
import { completeRemedy, createIssue, getIssue, requestRemedy, resolveIssue, respondRemedy } from "@/services/issues";

export async function createIssueAction(_state, formData) {
  const { user, error } = await authorize("ISSUE_CREATE");
  if (error) return error;
  const { values, errors, typeInfo, ok } = parseIssueForm(formData, user.role);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, { ...values, quantity: Number.isNaN(values.quantity) ? "" : values.quantity });

  const image = await resolveImageField(formData, { folder: "issues" });
  if (image.error) return errorState("Bukti tidak valid.", { image: image.error }, values);

  let outcome;
  try {
    outcome = await createIssue(user, values, typeInfo, image.url);
  } catch (caught) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState(databaseMessage(caught), {}, values);
  }
  if (!outcome.ok) {
    if (image.newUpload) await deleteUploadedImage(image.newUpload);
    return errorState(outcome.message, {}, values);
  }
  await setFlash("success", `Laporan ${outcome.number} terkirim ke Warehouse Manager.`);
  redirect(`${getHomePath(user.role)}/issues/${outcome.id}`);
}

export async function resolveIssueAction(_state, formData) {
  const { user, error } = await authorize("ISSUE_RESOLVE");
  if (error) return error;
  const id = formData.get("issueId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const { values, errors, ok } = parseResolution(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  try {
    const outcome = await resolveIssue(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    revalidatePath(`/manager/issues/${id}`);
    return successState(`Laporan ${outcome.number} diperbarui.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

async function remedyAction(permission, formData, run, successText) {
  const { user, error } = await authorize(permission);
  if (error) return error;
  const id = formData.get("issueId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  try {
    const outcome = await run(user, id);
    if (outcome.errorState) return outcome.errorState;
    if (!outcome.ok) return errorState(outcome.message);
    for (const role of ["manager", "staff", "supplier"]) revalidatePath(`/${role}/issues/${id}`);
    return successState(successText(outcome));
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function requestRemedyAction(_state, formData) {
  return remedyAction("ISSUE_RESOLVE", formData, async (user, id) => {
    const { values, errors, ok } = parseRemedyRequest(formData);
    if (!ok) return { errorState: errorState("Periksa kembali isian formulir.", errors, values) };
    return requestRemedy(user, id, values);
  }, (o) => `Permintaan untuk ${o.number} dikirim ke supplier.`);
}

export async function respondRemedyAction(_state, formData) {
  return remedyAction("ISSUE_REMEDY_RESPOND", formData, async (user, id) => {
    const issue = await getIssue(user, id);
    if (!issue?.remedy) return { ok: false, message: "Laporan tidak ditemukan." };
    const { values, errors, ok } = parseRemedyResponse(formData, issue.remedy);
    if (!ok) return { errorState: errorState("Periksa kembali isian formulir.", errors, values) };
    return respondRemedy(user, id, values);
  }, (o) => `Tanggapan untuk ${o.number} terkirim ke Warehouse Manager.`);
}

export async function completeRemedyAction(_state, formData) {
  return remedyAction("ISSUE_RESOLVE", formData, async (user, id) => {
    const { values } = parseRemedyComplete(formData);
    if (values.transactionId && !isUuid(values.transactionId)) return { ok: false, message: "Transaksi tidak valid." };
    return completeRemedy(user, id, values);
  }, (o) => `Laporan ${o.number} selesai.`);
}
