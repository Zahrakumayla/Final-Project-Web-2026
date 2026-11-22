"use client";

import { useActionState, useState } from "react";
import { createIncomingAction, createOutgoingAction, updateTransactionAction } from "@/actions/transactions";
import { Icon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

const INITIAL = { status: "idle", errors: {}, values: {} };
const EMPTY_ROW = { productId: "", rackId: "", quantity: "", damagedQuantity: "", expectedQuantity: "", itemNote: "" };

// Form barang masuk/keluar. mode: "create" | "edit". type: "INCOMING" | "OUTGOING".
// products: [{ productId, name, sku, unit, racks: [{ rackId, rackCode, quantity }] }]
export function TransactionForm({ type, mode, transaction, products, suppliers = [], purchaseOrders = [], presetPoId, today, cancelHref }) {
  const incoming = type === "INCOMING";
  const edit = mode === "edit";
  const action = edit ? updateTransactionAction : incoming ? createIncomingAction : createOutgoingAction;
  const [state, formAction] = useActionState(action, INITIAL);
  const e = state.errors ?? {};

  const startPo = purchaseOrders.find((po) => po.id === (state.values?.restockOrderId || presetPoId));
  const rowsFromPo = (po) => po.items.map((item) => {
    const product = products.find((p) => p.productId === item.productId);
    const rack = product?.racks.find((r) => r.quantity > 0) ?? product?.racks[0];
    return { ...EMPTY_ROW, productId: item.productId, rackId: rack?.rackId ?? "", quantity: String(item.quantity), expectedQuantity: String(item.quantity) };
  });
  const toRow = (item) => ({ productId: item.productId ?? item.product_id, rackId: item.rackId ?? item.rack_id, quantity: String(item.quantity ?? ""), damagedQuantity: String(item.damagedQuantity ?? item.damaged_quantity ?? ""), expectedQuantity: String(item.expectedQuantity ?? item.expected_quantity ?? ""), itemNote: item.itemNote ?? item.item_note ?? "" });

  const [poId, setPoId] = useState(edit ? transaction.restock_order_id ?? "" : startPo?.id ?? "");
  const [supplierId, setSupplierId] = useState(state.values?.supplierId || (edit ? transaction.supplier_id : startPo?.supplier_id) || "");
  const [rows, setRows] = useState(() => {
    if (state.values?.items?.length) return state.values.items.map(toRow);
    if (edit) return transaction.items.map(toRow);
    if (startPo) return rowsFromPo(startPo);
    return [{ ...EMPTY_ROW }];
  });

  const update = (index, patch) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const productOf = (id) => products.find((p) => p.productId === id);
  const poLocked = Boolean(poId);
  const poProductIds = poLocked ? new Set(purchaseOrders.find((po) => po.id === poId)?.items.map((i) => i.productId) ?? transaction?.items.map((i) => i.product_id)) : null;
  const productOptions = poProductIds && poProductIds.size ? products.filter((p) => poProductIds.has(p.productId)) : products;

  function choosePo(id) {
    setPoId(id);
    const po = purchaseOrders.find((item) => item.id === id);
    if (po) { setSupplierId(po.supplier_id); setRows(rowsFromPo(po)); }
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {edit && <><input type="hidden" name="transactionId" value={transaction.id} /><input type="hidden" name="type" value={type} /></>}
      <FormMessage state={state} />

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Informasi transaksi</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="date" label="Tanggal transaksi" required error={e.date}>
            <Input id="date" type="date" max={today} defaultValue={state.values?.date ?? (edit ? transaction.transaction_date : today)} hasError={Boolean(e.date)} />
          </FormField>

          {incoming ? (
            <>
              {!edit && (
                <FormField id="restockOrderId" label="Nomor PO (opsional)" hint="Pilih PO agar supplier dan produk terisi otomatis." error={e.restockOrderId}>
                  <Select id="restockOrderId" name="restockOrderId" value={poId} onChange={(event) => choosePo(event.target.value)}>
                    <option value="">Tanpa PO</option>
                    {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number} - {po.company_name}</option>)}
                  </Select>
                </FormField>
              )}
              <FormField id="supplierId" label="Supplier" required error={e.supplierId}>
                {edit || poLocked ? (
                  <>
                    <Input id="supplierId-view" value={suppliers.find((s) => s.id === supplierId)?.company_name ?? ""} readOnly />
                    <input type="hidden" name="supplierId" value={supplierId} />
                  </>
                ) : (
                  <Select id="supplierId" name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} hasError={Boolean(e.supplierId)}>
                    <option value="">Pilih supplier</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
                  </Select>
                )}
              </FormField>
            </>
          ) : (
            <FormField id="customerName" label="Pelanggan / tujuan" required error={e.customerName}>
              <Input id="customerName" defaultValue={state.values?.customerName ?? transaction?.customer_name ?? ""} hasError={Boolean(e.customerName)} />
            </FormField>
          )}
        </div>
        <FormField id="notes" label="Catatan">
          <Textarea id="notes" defaultValue={state.values?.notes ?? transaction?.notes ?? ""} />
        </FormField>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Detail produk</h2>
            <p className="text-sm text-muted-foreground">{incoming ? "Isi jumlah yang diterima dengan baik dan jumlah rusak (rusak tidak masuk stok)." : "Pilih produk dan rak asal. Jumlah tidak boleh melebihi stok rak."}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { ...EMPTY_ROW }])}><Icon name="plus" className="size-4" /> Tambah</Button>
        </div>
        {e.items && <p role="alert" className="text-sm text-destructive">{e.items}</p>}

        <div className="space-y-4">
          {rows.map((row, index) => {
            const product = productOf(row.productId);
            const rack = product?.racks.find((r) => r.rackId === row.rackId);
            const name = (field) => `items[${index}][${field}]`;
            return (
              <div key={index} className="rounded-xl border border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select aria-label="Produk" name={name("productId")} value={row.productId} onChange={(event) => update(index, { productId: event.target.value, rackId: productOf(event.target.value)?.racks.find((r) => r.quantity > 0)?.rackId ?? productOf(event.target.value)?.racks[0]?.rackId ?? "" })}>
                    <option value="">Pilih produk</option>
                    {productOptions.map((p) => <option key={p.productId} value={p.productId}>{p.name} ({p.sku})</option>)}
                  </Select>
                  <Select aria-label="Rak" name={name("rackId")} value={row.rackId} disabled={!product} onChange={(event) => update(index, { rackId: event.target.value })}>
                    <option value="">Pilih rak</option>
                    {product?.racks.map((r) => <option key={r.rackId} value={r.rackId}>{r.rackCode} (stok {r.quantity})</option>)}
                  </Select>
                </div>
                <div className={`mt-3 grid gap-3 ${incoming ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
                  <FormField id={`q-${index}`} label={incoming ? "Diterima (layak)" : `Jumlah${rack ? ` (maks ${rack.quantity})` : ""}`}>
                    <Input id={`q-${index}`} name={name("quantity")} inputMode="numeric" value={row.quantity} onChange={(event) => update(index, { quantity: event.target.value })} />
                  </FormField>
                  {incoming && (
                    <>
                      <FormField id={`d-${index}`} label="Rusak">
                        <Input id={`d-${index}`} name={name("damagedQuantity")} inputMode="numeric" value={row.damagedQuantity} onChange={(event) => update(index, { damagedQuantity: event.target.value })} />
                      </FormField>
                      <FormField id={`x-${index}`} label="Jumlah di PO" hint={poLocked ? "Dari PO" : "Opsional"}>
                        <Input id={`x-${index}`} name={name("expectedQuantity")} inputMode="numeric" value={row.expectedQuantity} readOnly={poLocked} onChange={(event) => update(index, { expectedQuantity: event.target.value })} />
                      </FormField>
                    </>
                  )}
                  <FormField id={`n-${index}`} label="Catatan baris">
                    <Input id={`n-${index}`} name={name("itemNote")} value={row.itemNote} onChange={(event) => update(index, { itemNote: event.target.value })} />
                  </FormField>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" size="sm" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, i) => i !== index))}><Icon name="trash" className="size-4" /> Hapus baris</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="outline">Batal</ButtonLink>
        <SubmitButton>{edit ? "Simpan perubahan" : "Simpan & ajukan persetujuan"}</SubmitButton>
      </div>
    </form>
  );
}
