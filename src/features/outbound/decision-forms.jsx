"use client";

import { useActionState } from "react";
import { approveOutboundAction, shipOutboundAction } from "@/actions/outbound";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Manager menyetujui SATU KALI. Jumlah disetujui <= Stok Tersedia (bawaan: sebesar stok yang ada).
// Produk dengan Stok Tersedia 0 diisi 0 (tidak disetujui).
export function ApproveForm({ order }) {
  const [state, action] = useActionState(approveOutboundAction, INITIAL);
  useActionToast(state);
  const errors = state.errors ?? {};
  if (state.status === "success") return null;
  return (
    <Card>
      <CardHeader title="Keputusan persetujuan" />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="orderId" value={order.id} />
        <FormMessage state={state} />
        <div className="space-y-3">
          {order.items.map((item) => {
            const suggested = Math.max(0, Math.min(item.requested_qty, item.available_stock));
            const key = `approve[${item.id}]`;
            return (
              <div key={item.id} className="grid items-start gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_10rem]">
                <div className="text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Diminta {formatNumber(item.requested_qty)} · Fisik {formatNumber(item.physical_stock)} · Dialokasikan {formatNumber(item.allocated_stock)} ·{" "}
                    <span className={item.available_stock > 0 ? "font-semibold text-foreground" : "font-semibold text-destructive"}>Tersedia {formatNumber(item.available_stock)}</span>
                  </p>
                  {item.available_stock <= 0 && <p className="mt-1 text-xs font-medium text-destructive">Stok gudang kosong: produk ini tidak dapat disetujui (isi 0).</p>}
                  {item.available_stock > 0 && item.available_stock < item.requested_qty && <p className="mt-1 text-xs font-medium text-warning">Stok tersedia kurang dari permintaan: disetujui sebesar stok yang ada.</p>}
                </div>
                <FormField id={`ap-${item.id}`} label="Disetujui" error={errors[`approve-${item.id}`]}>
                  <Input id={`ap-${item.id}`} name={key} inputMode="numeric" defaultValue={state.values?.[key] ?? String(suggested)} readOnly={item.available_stock <= 0} hasError={Boolean(errors[`approve-${item.id}`])} />
                </FormField>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end"><SubmitButton pendingLabel="Menyetujui...">Setujui & Alokasikan</SubmitButton></div>
      </form>
    </Card>
  );
}

// Staff: Barang Telah Dikirim. Pilih rak asal dan isi jumlah aktual.
export function ShipForm({ order }) {
  const [state, action] = useActionState(shipOutboundAction, INITIAL);
  useActionToast(state);
  const errors = state.errors ?? {};
  const v = (key, fallback) => state.values?.[key] ?? fallback;
  if (state.status === "success") return null;
  return (
    <Card>
      <CardHeader title="Barang Telah Dikirim" />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="orderId" value={order.id} />
        <FormMessage state={state} />
        <div className="space-y-3">
          {order.items.filter((item) => item.approved_qty > 0).map((item) => {
            const best = item.racks.find((r) => r.quantity >= item.approved_qty) ?? item.racks[0];
            return (
              <div key={item.id} className="grid items-start gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_10rem_9rem]">
                <div className="text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Disetujui {formatNumber(item.approved_qty)} {item.unit}</p>
                  {errors[`ship-${item.id}`] && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{errors[`ship-${item.id}`]}</p>}
                </div>
                <FormField id={`rk-${item.id}`} label="Rak asal">
                  <Select id={`rk-${item.id}`} name={`ship[${item.id}][rackId]`} defaultValue={v(`ship[${item.id}][rackId]`, best?.rackId ?? "")}>
                    <option value="">Pilih rak</option>
                    {item.racks.map((r) => <option key={r.rackId} value={r.rackId}>{r.rackCode} (stok {r.quantity})</option>)}
                  </Select>
                </FormField>
                <FormField id={`sq-${item.id}`} label="Jumlah aktual">
                  <Input id={`sq-${item.id}`} name={`ship[${item.id}][qty]`} inputMode="numeric" defaultValue={v(`ship[${item.id}][qty]`, String(item.approved_qty))} />
                </FormField>
              </div>
            );
          })}
        </div>
        <FormField id="shipNote" label="Catatan pengiriman" hint="Wajib bila jumlah dikirim kurang dari jumlah disetujui (sisa alokasi akan dilepas)." error={errors.shipNote}>
          <Textarea id="shipNote" name="shipNote" defaultValue={v("shipNote", "")} hasError={Boolean(errors.shipNote)} className="min-h-16" />
        </FormField>
        <div className="flex justify-end"><SubmitButton pendingLabel="Memproses...">Barang Telah Dikirim</SubmitButton></div>
      </form>
    </Card>
  );
}
