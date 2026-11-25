"use client";

import { useActionState, useState } from "react";
import { approveInspectionAction } from "@/actions/inspections";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { CLAIM_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/cn";

const INITIAL = { status: "idle", errors: {}, values: {} };
const CHOICES = [
  { value: "Replacement", label: "Minta barang pengganti / yang benar" },
  { value: "Refund", label: "Minta refund" },
  { value: "", label: "Putuskan nanti di menu Klaim" },
];

// Manager membaca laporan Staff lalu menyetujui. Temuan bermasalah (kurang, rusak, tidak sesuai) otomatis
// menjadi klaim; di sini Manager bisa langsung memilih tindakan ke supplier untuk tiap temuan.
export function ApproveInspectionForm({ inspectionId, problems, goodTotal }) {
  const [state, action] = useActionState(approveInspectionAction, INITIAL);
  useActionToast(state);
  const [choices, setChoices] = useState(() => Object.fromEntries(problems.map((p) => [p.key, "Replacement"])));
  if (state.status === "success") return null;
  return (
    <Card id="tindakan-klaim" className="scroll-mt-24 border-warning/40">
      <CardHeader
        title="Setujui laporan & ajukan klaim ke supplier"
        description={`${problems.length} temuan bermasalah · stok bertambah ${goodTotal} unit saat disetujui`}
      />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="inspectionId" value={inspectionId} />
        <FormMessage state={state} />
        <div className="space-y-3">
          {problems.map((p) => (
            <fieldset key={p.key} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-semibold">
                {CLAIM_TYPE_LABEL[p.type]} · {p.name} · {p.quantity} unit
              </legend>
              {p.note && <p className="mb-2 text-xs text-muted-foreground">Catatan Staff: {p.note}</p>}
              <div className="flex flex-wrap gap-2">
                {CHOICES.map((choice) => (
                  <label key={choice.value || "later"} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", (choices[p.key] ?? "") === choice.value ? "border-primary bg-primary/10 font-medium" : "border-border")}>
                    <input type="radio" name={`choice-${p.key}`} value={choice.value} checked={(choices[p.key] ?? "") === choice.value}
                      onChange={() => setChoices((c) => ({ ...c, [p.key]: choice.value }))} className="sr-only" />
                    {choice.label}
                  </label>
                ))}
              </div>
              {choices[p.key] && <input type="hidden" name={`resolution[${p.key}]`} value={choices[p.key]} />}
            </fieldset>
          ))}
        </div>
        <div className="flex justify-end"><SubmitButton pendingLabel="Menyetujui...">Setujui & Ajukan Klaim</SubmitButton></div>
      </form>
    </Card>
  );
}
