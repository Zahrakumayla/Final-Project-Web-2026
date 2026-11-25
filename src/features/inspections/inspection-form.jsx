"use client";

import { useActionState, useState } from "react";
import { submitInspectionAction } from "@/actions/inspections";
import { Icon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const INITIAL = { status: "idle", errors: {}, values: {} };
const FILE_CLASS = "block w-full text-xs file:mr-2 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-2.5 file:py-1.5 file:text-xs file:font-medium";
const toNum = (v) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);

// Form laporan pemeriksaan per produk.
//   expected : isi pengiriman (produk + jumlah dipesan) dari database
//   current  : hasil yang pernah dikirim (saat revisi) -> jadi nilai awal
// Kondisi A sesuai & baik, B kurang/rusak (catatan wajib, foto wajib untuk rusak),
// C tidak sesuai pesanan (produk seharusnya vs aktual, jumlah, catatan, foto).
export function InspectionForm({ inspectionId, expected, current, currentMismatches, racks, catalog, notes }) {
  const [state, action] = useActionState(submitInspectionAction, INITIAL);
  useActionToast(state);
  const errors = state.errors ?? {};
  const savedItems = state.values?.items;
  const currentByProduct = Object.fromEntries(current.map((c) => [c.product_id, c]));

  const [rows, setRows] = useState(() =>
    expected.map((exp) => {
      const saved = savedItems?.[exp.product_id];
      const cur = currentByProduct[exp.product_id];
      return {
        productId: exp.product_id,
        goodQty: saved?.goodQty ?? (cur ? String(cur.good_qty) : String(exp.ordered_qty)),
        damagedQty: saved?.damagedQty ?? (cur ? String(cur.damaged_qty) : "0"),
        shortageQty: saved ? String(Math.max(0, exp.ordered_qty - (toNum(saved.goodQty) ?? 0) - (toNum(saved.damagedQty) ?? 0))) : String(cur ? Math.max(0, exp.ordered_qty - cur.received_qty) : 0),
        rackId: saved?.rackId ?? cur?.rack_id ?? exp.suggested_rack_id ?? "",
        note: saved?.note ?? cur?.note ?? "",
      };
    }),
  );
  const [mismatches, setMismatches] = useState(() =>
    state.values?.mismatches ??
    currentMismatches.map((m) => ({
      expectedProductId: m.expected_product_id, actualProductId: m.actual_product_id ?? "", actualDescription: m.actual_description ?? "",
      quantity: String(m.quantity), note: m.note, keepPhoto: m.photo_url,
    })),
  );

  const update = (index, patch) => setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  // Baik, rusak, dan kurang saling terhubung: dipesan = baik + rusak + kurang. Mengubah salah satunya
  // langsung menghitung ulang yang lain, jadi Staff cukup mengisi yang ia temukan (mis. langsung isi "Kurang").
  const setGood = (index, value, ordered) => {
    const good = toNum(value);
    const damaged = toNum(rows[index].damagedQty) ?? 0;
    update(index, { goodQty: value, ...(good === null ? {} : { shortageQty: String(Math.max(0, ordered - good - damaged)) }) });
  };
  const setDamaged = (index, value, ordered) => {
    const damaged = toNum(value);
    const shortage = toNum(rows[index].shortageQty) ?? 0;
    update(index, { damagedQty: value, ...(damaged === null ? {} : { goodQty: String(Math.max(0, ordered - shortage - damaged)) }) });
  };
  const setShortage = (index, value, ordered) => {
    const shortage = toNum(value);
    const damaged = toNum(rows[index].damagedQty) ?? 0;
    update(index, { shortageQty: value, ...(shortage === null ? {} : { goodQty: String(Math.max(0, ordered - shortage - damaged)) }) });
  };
  const updateMismatch = (index, patch) => setMismatches((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <FormMessage state={state} />

      <Card className="space-y-4">
        <CardHeader title="Hasil pemeriksaan per produk" />
        {expected.map((exp, index) => {
          const row = rows[index];
          const good = toNum(row.goodQty);
          const damaged = toNum(row.damagedQty);
          const shortageInput = toNum(row.shortageQty);
          const received = good === null || damaged === null ? null : good + damaged;
          const shortage = received === null ? null : Math.max(0, exp.ordered_qty - received);
          const formulaOk = received !== null && shortageInput !== null && shortage === shortageInput;
          const condition = received === null ? null : damaged > 0 || shortage > 0 ? "B" : "A";
          const cur = currentByProduct[exp.product_id];
          const error = errors[`item-${exp.product_id}`];
          const name = (field) => `items[${index}][${field}]`;
          return (
            <div key={exp.product_id} className={cn("rounded-xl border p-4", error ? "border-destructive" : "border-border")}>
              <input type="hidden" name={name("productId")} value={exp.product_id} />
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{exp.name}</p>
                  <p className="text-xs text-muted-foreground">{exp.sku} · Dipesan <span className="font-semibold text-foreground">{exp.ordered_qty} {exp.unit}</span></p>
                </div>
                {condition && (
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", condition === "A" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                    {condition === "A" ? "A · Sesuai dan baik" : "B · Kurang atau rusak"}
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-5">
                <FormField id={`g-${index}`} label="Baik"><Input id={`g-${index}`} name={name("goodQty")} inputMode="numeric" value={row.goodQty} onChange={(e) => setGood(index, e.target.value, exp.ordered_qty)} /></FormField>
                <FormField id={`d-${index}`} label="Rusak"><Input id={`d-${index}`} name={name("damagedQty")} inputMode="numeric" value={row.damagedQty} onChange={(e) => setDamaged(index, e.target.value, exp.ordered_qty)} /></FormField>
                <FormField id={`s-${index}`} label="Kurang"><Input id={`s-${index}`} name={name("shortageQty")} inputMode="numeric" value={row.shortageQty} onChange={(e) => setShortage(index, e.target.value, exp.ordered_qty)} /></FormField>
                <FormField id={`r-${index}`} label="Diterima (otomatis)">
                  <Input id={`r-${index}`} value={received === null ? "-" : received} readOnly tabIndex={-1} />
                  <input type="hidden" name={name("receivedQty")} value={received === null ? "" : received} />
                </FormField>
                <FormField id={`k-${index}`} label="Rak tujuan">
                  <Select id={`k-${index}`} name={name("rackId")} value={row.rackId} onChange={(e) => update(index, { rackId: e.target.value })}>
                    <option value="">Pilih rak</option>
                    {racks.map((r) => <option key={r.id} value={r.id}>{r.rack_code}</option>)}
                  </Select>
                </FormField>
              </div>
              {received !== null && !formulaOk && <p className="mt-2 text-xs font-medium text-warning">Kurang diisi {shortageInput ?? "-"}, tetapi dipesan {exp.ordered_qty} - diterima {received} = {shortage}. Angka kurang disesuaikan otomatis saat Anda mengubah baik atau rusak.</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_16rem]">
                <FormField id={`n-${index}`} label={`Catatan${condition === "B" ? " (wajib)" : ""}`}>
                  <Input id={`n-${index}`} name={name("note")} value={row.note} placeholder={condition === "B" ? "Jelaskan barang yang kurang / rusak" : "Opsional (mis. kelebihan kiriman)"} onChange={(e) => update(index, { note: e.target.value })} />
                </FormField>
                <div>
                  <span className="mb-1.5 block text-sm font-medium">Foto bukti{damaged > 0 ? " (wajib)" : ""}</span>
                  <input type="file" name={name("photo")} accept="image/jpeg,image/png" className={FILE_CLASS} />
                  {cur?.photo_url && <a href={cur.photo_url} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">Foto sebelumnya tersimpan (biarkan kosong untuk memakai)</a>}
                </div>
              </div>
              {error && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>}
            </div>
          );
        })}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardHeader title="C · Barang tidak sesuai pesanan" />
          <Button variant="outline" size="sm" onClick={() => setMismatches((m) => [...m, { expectedProductId: expected[0]?.product_id ?? "", actualProductId: "", actualDescription: "", quantity: "", note: "", keepPhoto: "" }])}>
            <Icon name="plus" className="size-4" /> Tambah temuan
          </Button>
        </div>
        {mismatches.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada barang yang tidak sesuai.</p>}
        {mismatches.map((m, index) => {
          const error = errors[`mismatch-${index}`];
          const name = (field) => `mismatches[${index}][${field}]`;
          return (
            <div key={index} className={cn("rounded-xl border p-4", error ? "border-destructive" : "border-border")}>
              <input type="hidden" name={name("keepPhoto")} value={m.keepPhoto ?? ""} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id={`me-${index}`} label="Produk yang seharusnya">
                  <Select id={`me-${index}`} name={name("expectedProductId")} value={m.expectedProductId} onChange={(e) => updateMismatch(index, { expectedProductId: e.target.value })}>
                    {expected.map((exp) => <option key={exp.product_id} value={exp.product_id}>{exp.name}</option>)}
                  </Select>
                </FormField>
                <FormField id={`ma-${index}`} label="Produk aktual (dari katalog)">
                  <Select id={`ma-${index}`} name={name("actualProductId")} value={m.actualProductId} onChange={(e) => updateMismatch(index, { actualProductId: e.target.value })}>
                    <option value="">Tidak ada di katalog</option>
                    {catalog.filter((p) => p.product_id !== m.expectedProductId).map((p) => <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.sku})</option>)}
                  </Select>
                </FormField>
                {!m.actualProductId && (
                  <FormField id={`md-${index}`} label="Keterangan produk aktual" className="sm:col-span-2">
                    <Input id={`md-${index}`} name={name("actualDescription")} value={m.actualDescription} placeholder="Produk di luar katalog: tulis nama / ciri barangnya" onChange={(e) => updateMismatch(index, { actualDescription: e.target.value })} />
                  </FormField>
                )}
                <FormField id={`mq-${index}`} label="Jumlah"><Input id={`mq-${index}`} name={name("quantity")} inputMode="numeric" value={m.quantity} onChange={(e) => updateMismatch(index, { quantity: e.target.value })} /></FormField>
                <div>
                  <span className="mb-1.5 block text-sm font-medium">Foto bukti (wajib)</span>
                  <input type="file" name={name("photo")} accept="image/jpeg,image/png" className={FILE_CLASS} />
                  {m.keepPhoto && <a href={m.keepPhoto} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">Foto sebelumnya tersimpan</a>}
                </div>
                <FormField id={`mn-${index}`} label="Catatan (wajib)" className="sm:col-span-2">
                  <Input id={`mn-${index}`} name={name("note")} value={m.note} onChange={(e) => updateMismatch(index, { note: e.target.value })} />
                </FormField>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {error ? <p role="alert" className="text-xs font-medium text-destructive">{error}</p> : <span />}
                <Button variant="ghost" size="sm" onClick={() => setMismatches((list) => list.filter((_, i) => i !== index))}><Icon name="trash" className="size-4" /> Hapus</Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <FormField id="inspection-notes" label="Catatan umum pemeriksaan">
          <Textarea id="inspection-notes" name="notes" defaultValue={state.values?.notes ?? notes ?? ""} placeholder="Kondisi kemasan, kelebihan kiriman, dll." />
        </FormField>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Mengirim laporan...">Kirim Laporan Pemeriksaan</SubmitButton>
      </div>
    </form>
  );
}
