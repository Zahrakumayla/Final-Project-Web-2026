"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorize, isUuid, successState } from "@/lib/action-helpers";
import { getHomePath } from "@/lib/permissions";
import { markAllRead, markRead } from "@/services/notifications";

// Membuka notifikasi: tandai dibaca lalu arahkan ke halaman terkait.
export async function openNotificationAction(formData) {
  const { user, error } = await authorize("NOTIFICATION_VIEW");
  if (error) return;
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const row = await markRead(user.id, id);
  // Hanya path internal milik role-nya yang diikuti (cegah open redirect).
  const base = getHomePath(user.role);
  if (row?.link_path && row.link_path.startsWith(`${base}/`)) redirect(row.link_path);
  revalidatePath(`${base}/notifications`);
}

export async function markAllReadAction() {
  const { user, error } = await authorize("NOTIFICATION_VIEW");
  if (error) return error;
  await markAllRead(user.id);
  revalidatePath(`${getHomePath(user.role)}/notifications`);
  return successState("Semua notifikasi ditandai sudah dibaca.");
}
