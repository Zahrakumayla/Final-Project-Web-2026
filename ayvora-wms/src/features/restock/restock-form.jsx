"use client";

import { useActionState, useMemo, useState } from "react";
import { createRestockAction } from "@/actions/restock";
import { Icon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Form PO: produk yang bisa dipilih otomatis disaring sesuai kategori yang dipasok supplier.
export function RestockForm({ suppliers, products, presetProduct, minDate }) {
  const [state, action] = useActionState(createRestockAction, INITIAL);
  const e = state.errors ?? {};
  const preset = products.find((p) => p.product_id === presetProduct);
  const presetSupplier = preset ? suppliers.find((s) => s.category_ids.includes(preset.category_id)) : null;

  const [supplierId, setSupplierId] = useState(state.values?.supplierId ?? presetSupplier?.id ?? "");
  const [rows, setRows] = useState(state.values?.items?.length ? state.values.items : [{ productId: preset && presetSupplier ? preset.product_id : "", quantity: "" }]);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const options = useMemo(() => (supplier ? products.filter((p) => supplier.category_ids.includes(p.category_id)) : []), [supplier, products]);

  const update = (index, patch) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="supplierId" label="Supplier" required error={e.supplierId}>
            <Select id="supplierId" name="supplierId" value={supplierId} hasError={Boolean(e.supplierId)} onChange={(event) => { setSupplierId(event.target.value); setRows((r) => r.map((row) => ({ ...row, productId: "" }))); }}>
              <option value="">Pilih supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </Select>
          </FormField>
          <FormField id="expectedDate" label="Estimasi tiba" required error={e.expectedDate}>
            <Input id="expectedDate" type="date" min={minDate} defaultValue={state.values?.expectedDate ?? ""} hasError={Boolean(e.expectedDate)} />
          </FormField>
        </div>
        <FormField id="notes" label="Catatan untuk supplier">
          <Textarea id="notes" defaultValue={state.values?.notes ?? ""} />
        </FormField>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Produk yang dipesan</h2>
            <p className="text-sm text-muted-foreground">{supplier ? "Hanya produk dari kategori yang dipasok supplier ini." : "Pilih supplier terlebih dahulu."}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { productId: "", quantity: "" }])}><Icon name="plus" className="size-4" /> Tambah baris</Button>
        </div>
        {e.items && <p role="alert" className="text-sm text-destructive">{e.items}</p>}
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="grid items-start gap-3 sm:grid-cols-[1fr_9rem_auto]">
              <Select aria-label="Produk" name={`items[${index}][productId]`} value={row.productId} disabled={!supplier} onChange={(event) => update(index, { productId: event.target.value })}>
                <option value="">Pilih produk</option>
                {options.map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.sku})</option>)}
              </Select>
              <Input aria-label="Jumlah" name={`items[${index}][quantity]`} inputMode="numeric" placeholder="Jumlah" value={row.quantity} onChange={(event) => update(index, { quantity: event.target.value })} />
              <Button variant="outline" aria-label="Hapus baris" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, i) => i !== index))}><Icon name="trash" className="size-4" /></Button>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/manager/restock" variant="outline">Batal</ButtonLink>
        <SubmitButton>Kirim PO ke supplier</SubmitButton>
      </div>
    </form>
  );
}
