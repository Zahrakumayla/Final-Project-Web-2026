"use client";

import { useActionState, useState } from "react";
import { createOutboundAction, updateOutboundAction } from "@/actions/outbound";
import { Icon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate, formatDateTime, formatNumber, todayString } from "@/lib/format";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Laporan barang keluar: pelanggan (bisnis F&B), alamat, kontak, produk, jumlah, catatan.
// order diisi saat mengubah / memperbaiki laporan yang ditolak.
export function OutboundForm({ products, order, cancelHref }) {
  const edit = Boolean(order);
  const [state, action] = useActionState(edit ? updateOutboundAction : createOutboundAction, INITIAL);
  const e = state.errors ?? {};
  const v = (name, fallback) => state.values?.[name] ?? fallback ?? "";
  const [rows, setRows] = useState(() => {
    if (state.values?.items?.length) return state.values.items.map((r) => ({ productId: r.productId, quantity: String(r.quantity ?? "") }));
    if (order) return order.items.map((i) => ({ productId: i.product_id, quantity: String(i.requested_qty) }));
    return [{ productId: "", quantity: "" }];
  });
  const update = (index, patch) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const productOf = (id) => products.find((p) => p.product_id === id);

  return (
    <form action={action} className="space-y-6" noValidate>
      {edit && <input type="hidden" name="orderId" value={order.id} />}
      <FormMessage state={state} />
      {order?.status === "Rejected" && (
        <p className="rounded-xl bg-danger-soft p-3 text-sm text-destructive">Alasan penolakan: {order.rejection_reason}. Menyimpan perubahan akan langsung mengajukan ulang ke Manager.</p>
      )}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Pelanggan & tujuan</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="orderNumberPreview" label="Nomor transaksi" hint={edit ? "Nomor tidak berubah." : "Dibuat otomatis oleh sistem saat laporan dikirim (format OUT-Tanggal-Urutan)."}>
            <Input id="orderNumberPreview" name="orderNumberPreview" value={edit ? order.order_number : "Otomatis"} readOnly tabIndex={-1} />
          </FormField>
          <FormField id="reportDatePreview" label="Tanggal laporan" hint="Diisi otomatis dengan waktu laporan dibuat.">
            <Input id="reportDatePreview" name="reportDatePreview" value={edit ? formatDateTime(order.created_at) : formatDate(todayString())} readOnly tabIndex={-1} />
          </FormField>
          <FormField id="customerName" label="Nama pelanggan / perusahaan" required error={e.customerName}>
            <Input id="customerName" defaultValue={v("customerName", order?.customer_name)} placeholder="Contoh: Kafe Kopi Senja" hasError={Boolean(e.customerName)} />
          </FormField>
          <FormField id="contactPhone" label="Nomor kontak" required error={e.contactPhone}>
            <Input id="contactPhone" inputMode="tel" defaultValue={v("contactPhone", order?.contact_phone)} hasError={Boolean(e.contactPhone)} />
          </FormField>
        </div>
        <FormField id="destinationAddress" label="Alamat tujuan" required error={e.destinationAddress}>
          <Textarea id="destinationAddress" defaultValue={v("destinationAddress", order?.destination_address)} className="min-h-16" hasError={Boolean(e.destinationAddress)} />
        </FormField>
        <FormField id="notes" label="Catatan">
          <Textarea id="notes" defaultValue={v("notes", order?.notes)} className="min-h-16" />
        </FormField>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Produk</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { productId: "", quantity: "" }])}><Icon name="plus" className="size-4" /> Tambah</Button>
        </div>
        {e.items && <p role="alert" className="text-sm text-destructive">{e.items}</p>}
        <div className="space-y-3">
          {rows.map((row, index) => {
            const product = productOf(row.productId);
            return (
              <div key={index} className="grid items-start gap-3 sm:grid-cols-[1fr_8rem_auto]">
                <div>
                  <Select aria-label="Produk" name={`items[${index}][productId]`} value={row.productId} onChange={(event) => update(index, { productId: event.target.value })}>
                    <option value="">Pilih produk</option>
                    {products.map((p) => <option key={p.product_id} value={p.product_id} disabled={p.available_stock <= 0}>{p.product_name} ({p.sku}) - {p.available_stock > 0 ? `tersedia ${formatNumber(p.available_stock)}` : "stok habis"}</option>)}
                  </Select>
                  {product && Number(row.quantity) > product.available_stock && <p className="mt-1 text-xs text-destructive">Melebihi stok tersedia ({formatNumber(product.available_stock)} {product.unit}). Laporan akan ditolak sistem.</p>}
                </div>
                <Input aria-label="Jumlah" name={`items[${index}][quantity]`} inputMode="numeric" placeholder="Jumlah" value={row.quantity} onChange={(event) => update(index, { quantity: event.target.value })} />
                <Button variant="outline" aria-label="Hapus baris" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, i) => i !== index))}><Icon name="trash" className="size-4" /></Button>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="outline">Batal</ButtonLink>
        <SubmitButton>{order?.status === "Rejected" ? "Simpan & Ajukan Ulang" : edit ? "Simpan perubahan" : "Kirim ke Manager"}</SubmitButton>
      </div>
    </form>
  );
}
