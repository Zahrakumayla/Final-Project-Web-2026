"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { readText } from "@/lib/validation/helpers";
import { parseApprovalForm, parseOutboundForm, parseShipOutForm } from "@/lib/validation/outbound";
import { approveOutbound, cancelOutbound, createOutbound, deleteOutbound, getOutbound, rejectOutbound, shipOutbound, startPreparing, updateOutbound } from "@/services/outbound";

const refresh = (id) => {
  revalidatePath(`/staff/outgoing/${id}`);
  revalidatePath(`/manager/outgoing/${id}`);
};

export async function createOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_CREATE");
  if (error) return error;
  const { values, errors, ok } = parseOutboundForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  let outcome;
  try {
    outcome = await createOutbound(user, values);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
  if (!outcome.ok) return errorState(outcome.message, {}, values);
  await setFlash("success", `${outcome.number} dikirim ke Manager (Pending Approval).`);
  redirect(`/staff/outgoing/${outcome.id}`);
}

export async function updateOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_CREATE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const { values, errors, ok } = parseOutboundForm(formData);
  if (!ok) return errorState("Periksa kembali isian formulir.", errors, values);
  let outcome;
  try {
    outcome = await updateOutbound(user, id, values);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
  if (!outcome.ok) return errorState(outcome.message, {}, values);
  await setFlash("success", outcome.resubmit ? `${outcome.number} diperbaiki dan diajukan ulang.` : `${outcome.number} diperbarui.`);
  redirect(`/staff/outgoing/${id}`);
}

export async function approveOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_DECIDE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const order = await getOutbound(id);
  if (!order) return errorState("Laporan tidak ditemukan.");
  const values = Object.fromEntries(order.items.map((item) => [`approve[${item.id}]`, readText(formData, `approve[${item.id}]`, 10)]));
  const { approved, errors, ok } = parseApprovalForm(formData, order.items);
  if (!ok) return errorState(errors.form ?? "Periksa jumlah disetujui.", errors, values);
  try {
    const outcome = await approveOutbound(user, id, approved);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    refresh(id);
    return successState(`${outcome.number} disetujui${outcome.partial ? " sebagian sesuai stok tersedia" : ""}. Stok dialokasikan.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

export async function rejectOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_DECIDE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const reason = readText(formData, "reason", 500);
  if (!reason) return errorState("Alasan penolakan wajib diisi.", { reason: "Alasan penolakan wajib diisi." });
  try {
    const outcome = await rejectOutbound(user, id, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`${outcome.number} ditolak. Staff akan memperbaiki.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function cancelOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_DECIDE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const reason = readText(formData, "reason", 500);
  if (!reason) return errorState("Alasan pembatalan wajib diisi.", { reason: "Alasan pembatalan wajib diisi." });
  try {
    const outcome = await cancelOutbound(user, id, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`${outcome.number} dibatalkan. Alokasi stok dilepas.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function startPreparingAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_CREATE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  try {
    const outcome = await startPreparing(user, id);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`${outcome.number}: barang sedang disiapkan.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function shipOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_CREATE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  const order = await getOutbound(id);
  if (!order) return errorState("Laporan tidak ditemukan.");
  const values = Object.fromEntries([...formData.entries()].filter(([key]) => key.startsWith("ship[") || key === "shipNote").map(([k, v]) => [k, String(v)]));
  const { rows, shipNote, errors, ok } = parseShipOutForm(formData, order.items);
  if (!ok) return errorState(errors.form ?? errors.shipNote ?? "Periksa jumlah dan rak asal.", errors, values);
  try {
    const outcome = await shipOutbound(user, id, rows, shipNote);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    refresh(id);
    return successState(`${outcome.number} telah dikirim. Stok fisik berkurang.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
}

export async function deleteOutboundAction(_state, formData) {
  const { user, error } = await authorize("OUTBOUND_DELETE");
  if (error) return error;
  const id = formData.get("orderId");
  if (!isUuid(id)) return errorState("Laporan tidak ditemukan.");
  try {
    const outcome = await deleteOutbound(user, id);
    if (!outcome.ok) return errorState(outcome.message);
    await setFlash("success", `${outcome.number} berhasil dihapus.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
  redirect("/staff/outgoing");
}
