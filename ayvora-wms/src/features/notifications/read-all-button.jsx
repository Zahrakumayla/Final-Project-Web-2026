"use client";

import { useActionState } from "react";
import { markAllReadAction } from "@/actions/notifications";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

export function ReadAllButton() {
  const [state, action] = useActionState(markAllReadAction, { status: "idle" });
  useActionToast(state);
  return (
    <form action={action}>
      <SubmitButton variant="outline" size="sm" pendingLabel="Memproses...">Tandai semua dibaca</SubmitButton>
    </form>
  );
}
