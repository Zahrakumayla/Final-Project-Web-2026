"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormField, FormMessage, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

const INITIAL_STATE = { status: "idle", errors: {}, values: {} };

// Tombol yang membuka dialog konfirmasi untuk tindakan penting (setujui, tolak, hapus, dst).
// Jika `reason` diberikan, dialog meminta alasan (mis. alasan penolakan).
// `action` adalah Server Action; `fields` dikirim sebagai input tersembunyi.
export function ActionDialog({
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  action,
  fields = {},
  reason,
  confirmLabel = "Ya, lanjutkan",
  confirmVariant = "primary",
  children,
}) {
  const dialogRef = useRef(null);
  const reasonId = `reason-${useId()}`;
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const { show } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      dialogRef.current?.close();
      if (state.message) show("success", state.message);
    }
  }, [state, show]);

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => dialogRef.current?.showModal()}>
        {triggerLabel}
      </Button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-black/50"
      >
        <form action={formAction} className="p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}

          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value ?? ""} />
          ))}

          {children}

          {reason && (
            <FormField id={reasonId} label={reason.label} required={reason.required} error={state.errors?.reason} className="mt-4">
              <Textarea id={reasonId} name="reason" placeholder={reason.placeholder} defaultValue={state.values?.reason} hasError={Boolean(state.errors?.reason)} />
            </FormField>
          )}

          {state.status === "error" && state.message && (
            <div className="mt-4"><FormMessage state={state} /></div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>Batal</Button>
            <SubmitButton variant={confirmVariant}>{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
