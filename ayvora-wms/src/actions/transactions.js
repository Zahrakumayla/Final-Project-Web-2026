"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, setFlash, successState } from "@/lib/action-helpers";
import { parseReviewReason, parseTransactionForm } from "@/lib/validation/transaction";
import { createTransaction, deleteTransaction, reviewTransaction, updateTransaction } from "@/services/transactions";

const PATH = { INCOMING: "incoming", OUTGOING: "outgoing" };

async function create(formData, type) {
  const { user, error } = await authorize("TRANSACTION_CREATE");
  if (error) return { error };
  const { values, errors, ok } = parseTransactionForm(formData, type);
  if (!ok) return { error: errorState("Periksa kembali isian formulir.", errors, values) };
  try {
    return { result: await createTransaction(user, type, values) };
  } catch (caught) {
    if (caught?.code === "23505") return { error: errorState("PO ini sudah dipakai transaksi barang masuk lain yang masih aktif.", {}, values) };
    return { error: errorState(databaseMessage(caught), {}, values) };
  }
}

export async function createIncomingAction(_state, formData) {
  const { error, result } = await create(formData, "INCOMING");
  if (error) return error;
  await setFlash("success", `${result.number} dicatat dan menunggu persetujuan Manager.`);
  redirect(`/staff/incoming/${result.id}`);
}

export async function createOutgoingAction(_state, formData) {
  const { error, result } = await create(formData, "OUTGOING");
  if (error) return error;
  await setFlash("success", `${result.number} dicatat dan menunggu persetujuan Manager.`);
  redirect(`/staff/outgoing/${result.id}`);
}

export async function updateTransactionAction(_state, formData) {
  const { user, error } = await authorize("TRANSACTION_CREATE");
  if (error) return error;
  const id = formData.get("transactionId");
  const type = formData.get("type") === "OUTGOING" ? "OUTGOING" : "INCOMING";
  if (!isUuid(id)) return errorState("Transaksi tidak ditemukan.");
  // Form edit mengirim supplierId tersembunyi agar validasi INCOMING lolos; nilainya tidak dipakai saat update.
  const parsed = parseTransactionForm(formData, type);
  const { values, errors } = parsed;
  if (type === "INCOMING") delete errors.supplierId;
  if (Object.keys(errors).length) return errorState("Periksa kembali isian formulir.", errors, values);
  try {
    const outcome = await updateTransaction(user, id, values);
    if (!outcome.ok) return errorState(outcome.message, {}, values);
    await setFlash("success", `${outcome.number} berhasil diperbarui.`);
  } catch (caught) {
    return errorState(databaseMessage(caught), {}, values);
  }
  redirect(`/staff/${PATH[type]}/${id}`);
}

export async function deleteTransactionAction(_state, formData) {
  const { user, error } = await authorize("TRANSACTION_CREATE");
  if (error) return error;
  const id = formData.get("transactionId");
  if (!isUuid(id)) return errorState("Transaksi tidak ditemukan.");
  let type = formData.get("type") === "OUTGOING" ? "OUTGOING" : "INCOMING";
  try {
    const outcome = await deleteTransaction(user, id);
    if (!outcome.ok) return errorState(outcome.message);
    await setFlash("success", `${outcome.number} dihapus.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
  redirect(`/staff/${PATH[type]}`);
}

async function review(formData, decision) {
  const { user, error } = await authorize("TRANSACTION_REVIEW");
  if (error) return error;
  const id = formData.get("transactionId");
  if (!isUuid(id)) return errorState("Transaksi tidak ditemukan.");
  const reason = parseReviewReason(formData);
  if (decision === "Rejected" && !reason) return errorState("Alasan penolakan wajib diisi.", { reason: "Alasan penolakan wajib diisi." }, { reason });
  try {
    const outcome = await reviewTransaction(user, id, decision, reason);
    if (!outcome.ok) return errorState(outcome.message);
    revalidatePath("/manager/transactions");
    return successState(decision === "Approved" ? `${outcome.number} disetujui. Stok diperbarui.` : `${outcome.number} ditolak.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export const approveTransactionAction = async (_s, formData) => review(formData, "Approved");
export const rejectTransactionAction = async (_s, formData) => review(formData, "Rejected");
