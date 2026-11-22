"use client";

import { useActionState } from "react";
import { updateShipmentAction } from "@/actions/shipments";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function ShipmentForm({ shipment, nextStatuses }) {
  const [state, action] = useActionState(updateShipmentAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  const v = (name, fallback) => state.values?.[name] ?? fallback ?? "";
  return (
    <Card>
      <CardHeader title="Perbarui pengiriman" description="Status hanya dapat maju sesuai urutan proses." />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="shipmentId" value={shipment.id} />
        <FormMessage state={state} />
        <FormField id="status" label="Ubah status" error={e.status}>
          <Select id="status" defaultValue="">
            <option value="">Tetap {shipment.delivery_status}</option>
            {nextStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="courierName" label="Kurir / ekspedisi" error={e.courierName}><Input id="courierName" defaultValue={v("courierName", shipment.courier_name)} hasError={Boolean(e.courierName)} /></FormField>
          <FormField id="trackingNumber" label="Nomor resi"><Input id="trackingNumber" defaultValue={v("trackingNumber", shipment.tracking_number)} /></FormField>
          <FormField id="estimatedDate" label="Estimasi tiba" error={e.estimatedDate}><Input id="estimatedDate" type="date" defaultValue={v("estimatedDate", shipment.estimated_arrival_date)} /></FormField>
        </div>
        <FormField id="notes" label="Catatan" error={e.notes} hint="Wajib diisi bila status Delivery Issue.">
          <Textarea id="notes" defaultValue={v("notes", shipment.notes)} hasError={Boolean(e.notes)} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Simpan</SubmitButton></div>
      </form>
    </Card>
  );
}
