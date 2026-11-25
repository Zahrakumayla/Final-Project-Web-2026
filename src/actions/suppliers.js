"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, successState } from "@/lib/action-helpers";
import { readText } from "@/lib/validation/helpers";
import { reviewSupplier } from "@/services/suppliers";

async function review(formData, decision) {
  const { user, error } = await authorize("SUPPLIER_VERIFY");
  if (error) return error;
  const supplierId = formData.get("supplierId");
  if (!isUuid(supplierId)) return errorState("Supplier tidak ditemukan.");

  const reason = readText(formData, "reason", 500);
  if (decision === "Rejected" && !reason) return errorState("Alasan penolakan wajib diisi.", { reason: "Alasan penolakan wajib diisi." }, { reason });

  try {
    const outcome = await reviewSupplier(user, supplierId, decision, reason);
    if (!outcome.ok) return errorState(outcome.message);
    revalidatePath("/admin/suppliers");
    return successState(decision === "Approved" ? `${outcome.name} disetujui. Supplier sekarang dapat masuk.` : `${outcome.name} ditolak.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export const approveSupplierAction = async (_state, formData) => review(formData, "Approved");
export const rejectSupplierAction = async (_state, formData) => review(formData, "Rejected");
