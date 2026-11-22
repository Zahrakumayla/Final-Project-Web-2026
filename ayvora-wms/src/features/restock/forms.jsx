"use client";

import { useActionState } from "react";
import { rateRestockAction, updateDeliveryAction } from "@/actions/restock";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function DeliveryForm({ order }) {
  const [state, action] = useActionState(updateDeliveryAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  const v = (name, fallback) => state.values?.[name] ?? fallback ?? "";
  return (
    <Card>
      <CardHeader title="Info pengiriman" description="Ubah estimasi tiba bila ada keterlambatan. Perubahan estimasi wajib disertai catatan." />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="restockId" value={order.id} />
        <FormMessage state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="expectedDate" label="Estimasi tiba" error={e.expectedDate}>
            <Input id="expectedDate" type="date" defaultValue={v("expectedDate", order.expected_delivery_date)} hasError={Boolean(e.expectedDate)} />
          </FormField>
          <FormField id="shippedDate" label="Tanggal kirim" error={e.shippedDate}>
            <Input id="shippedDate" type="date" defaultValue={v("shippedDate", order.shipped_date)} hasError={Boolean(e.shippedDate)} />
          </FormField>
          <FormField id="courierName" label="Kurir / ekspedisi">
            <Input id="courierName" defaultValue={v("courierName", order.courier_name)} />
          </FormField>
          <FormField id="trackingNumber" label="Nomor resi">
            <Input id="trackingNumber" defaultValue={v("trackingNumber", order.tracking_number)} />
          </FormField>
        </div>
        <FormField id="notes" label="Catatan pengiriman" error={e.notes}>
          <Textarea id="notes" defaultValue={v("notes", order.delivery_notes)} hasError={Boolean(e.notes)} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Simpan info pengiriman</SubmitButton></div>
      </form>
    </Card>
  );
}

export function RatingForm({ orderId }) {
  const [state, action] = useActionState(rateRestockAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader title="Nilai supplier" description="Penilaian hanya dapat diberikan sekali untuk PO yang sudah diterima." />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="restockId" value={orderId} />
        <FormMessage state={state} />
        <FormField id="rating" label="Rating" required error={e.rating}>
          <Select id="rating" hasError={Boolean(e.rating)} defaultValue="">
            <option value="">Pilih rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n} dari 5)</option>)}
          </Select>
        </FormField>
        <FormField id="feedback" label="Masukan (opsional)">
          <Textarea id="feedback" defaultValue={state.values?.feedback ?? ""} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Kirim rating</SubmitButton></div>
      </form>
    </Card>
  );
}
