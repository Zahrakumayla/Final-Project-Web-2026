"use server";

import { revalidatePath } from "next/cache";
import { authorize, databaseMessage, errorState, isUuid, successState } from "@/lib/action-helpers";
import { deleteUploadedImage, saveImage } from "@/lib/upload";
import { readText } from "@/lib/validation/helpers";
import { inspectionFormValues, parseInspectionForm } from "@/lib/validation/inbound";
import { approveInspection, getInspection, reportNotFound, requestRevision, startInspection, submitInspection } from "@/services/inspections";

const refresh = (id) => {
  revalidatePath(`/staff/inspections/${id}`);
  revalidatePath(`/manager/inspections/${id}`);
};

export async function startInspectionAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_PERFORM");
  if (error) return error;
  const id = formData.get("inspectionId");
  if (!isUuid(id)) return errorState("Tugas tidak ditemukan.");
  try {
    const outcome = await startInspection(user, id);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`${outcome.number}: pemeriksaan dimulai.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function reportNotFoundAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_PERFORM");
  if (error) return error;
  const id = formData.get("inspectionId");
  if (!isUuid(id)) return errorState("Tugas tidak ditemukan.");
  const reason = readText(formData, "reason", 1000);
  if (!reason) return errorState("Catatan wajib diisi.", { reason: "Jelaskan kondisi di lokasi (catatan wajib)." }, { reason });
  try {
    const outcome = await reportNotFound(user, id, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`${outcome.number}: laporan barang tidak ditemukan dikirim ke Manager.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

// Kirim Laporan Pemeriksaan. Foto diunggah dulu; bila validasi DB gagal, file baru dihapus
// (tidak ada file yatim) dan isian dikembalikan ke form.
export async function submitInspectionAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_PERFORM");
  if (error) return error;
  const id = formData.get("inspectionId");
  if (!isUuid(id)) return errorState("Tugas tidak ditemukan.");
  const inspection = await getInspection(user, id);
  if (!inspection) return errorState("Tugas tidak ditemukan.");
  if (inspection.status !== "Under Inspection") return errorState("Laporan hanya dapat dikirim saat status Under Inspection.");

  const currentByProduct = new Map(inspection.items.map((item) => [item.product_id, item]));
  const expected = inspection.expected.map((row) => ({ productId: row.product_id, name: row.name, orderedQty: row.ordered_qty, current: currentByProduct.get(row.product_id) }));
  const parsed = parseInspectionForm(formData, expected, inspection.mismatches.map((m) => m.photo_url));
  const formValues = inspectionFormValues(parsed.values);
  if (!parsed.ok) return errorState("Periksa kembali hasil pemeriksaan pada baris yang ditandai.", parsed.errors, formValues);

  // Unggah foto (cek isi file, maksimal 2 MB)
  const uploaded = [];
  const cleanup = () => Promise.all(uploaded.map((url) => deleteUploadedImage(url)));
  const items = [];
  for (const item of parsed.values.items) {
    let photoUrl = item.keptPhotoUrl;
    if (item.photoFile) {
      const saved = await saveImage(item.photoFile, "inspections");
      if (saved.error) {
        await cleanup();
        return errorState("Unggah foto gagal. Silakan ulangi.", { [`item-${item.productId}`]: saved.error }, formValues);
      }
      uploaded.push(saved.url);
      photoUrl = saved.url;
    }
    items.push({ ...item, photoUrl });
  }
  const mismatches = [];
  for (const m of parsed.values.mismatches) {
    let photoUrl = m.keptPhotoUrl;
    if (m.photoFile) {
      const saved = await saveImage(m.photoFile, "inspections");
      if (saved.error) {
        await cleanup();
        return errorState("Unggah foto gagal. Silakan ulangi.", { [`mismatch-${m.index}`]: saved.error }, formValues);
      }
      uploaded.push(saved.url);
      photoUrl = saved.url;
    }
    mismatches.push({ ...m, photoUrl });
  }

  try {
    const outcome = await submitInspection(user, id, { items, mismatches, notes: parsed.values.notes });
    if (!outcome.ok) {
      await cleanup();
      return errorState(outcome.message, {}, formValues);
    }
    await Promise.all(outcome.unusedPhotos.map((url) => deleteUploadedImage(url)));
    refresh(id);
    return successState(`${outcome.number}: laporan dikirim ke Manager untuk disetujui.`);
  } catch (caught) {
    await cleanup();
    return errorState(databaseMessage(caught), {}, formValues);
  }
}

export async function approveInspectionAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_APPROVE");
  if (error) return error;
  const id = formData.get("inspectionId");
  if (!isUuid(id)) return errorState("Pemeriksaan tidak ditemukan.");
  try {
    const resolutions = {};
    for (const [key, value] of formData.entries()) {
      const match = /^resolution\[(Shortage|Damaged|Wrong Item):([0-9a-f-]{36})\]$/.exec(key);
      if (match && (value === "Refund" || value === "Replacement")) resolutions[`${match[1]}:${match[2]}`] = value;
    }
    const outcome = await approveInspection(user, id, resolutions);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    revalidatePath("/manager/claims");
    const claims = outcome.claims ? ` ${outcome.claims} klaim masuk ke menu Klaim${outcome.requested ? ` dan ${outcome.requested} sudah diajukan ke supplier` : ". Pilih penyelesaian dari halaman ini atau menu Klaim"}.` : "";
    return successState(`${outcome.number} disetujui. Stok bertambah ${outcome.good} unit.${claims}`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}

export async function requestRevisionAction(_state, formData) {
  const { user, error } = await authorize("INSPECTION_APPROVE");
  if (error) return error;
  const id = formData.get("inspectionId");
  if (!isUuid(id)) return errorState("Pemeriksaan tidak ditemukan.");
  const reason = readText(formData, "reason", 1000);
  if (!reason) return errorState("Alasan revisi wajib diisi.", { reason: "Alasan revisi wajib diisi." }, { reason });
  try {
    const outcome = await requestRevision(user, id, reason);
    if (!outcome.ok) return errorState(outcome.message);
    refresh(id);
    return successState(`Revisi ${outcome.number} dikirim ke Staff.`);
  } catch (caught) {
    return errorState(databaseMessage(caught));
  }
}
