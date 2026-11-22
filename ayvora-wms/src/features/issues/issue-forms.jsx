"use client";

import { useActionState, useState } from "react";
import { completeRemedyAction, createIssueAction, requestRemedyAction, resolveIssueAction, respondRemedyAction } from "@/actions/issues";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function IssueForm({ types, references, products, presetReference, cancelHref }) {
  const [state, action] = useActionState(createIssueAction, INITIAL);
  const e = state.errors ?? {};
  const preset = references.find((r) => r.id === presetReference);
  const [type, setType] = useState(state.values?.type ?? types.find((t) => t.ref === preset?.ref)?.value ?? "");
  const typeInfo = types.find((t) => t.value === type);
  const refs = references.filter((r) => r.ref === typeInfo?.ref);

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="type" label="Jenis masalah" required error={e.type}>
            <Select id="type" name="type" value={type} onChange={(event) => setType(event.target.value)} hasError={Boolean(e.type)}>
              <option value="">Pilih jenis</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
          <FormField id="referenceId" label={typeInfo?.ref === "restock" ? "Nomor PO" : "Nomor transaksi"} required error={e.referenceId}>
            <Select id="referenceId" key={type} defaultValue={state.values?.referenceId ?? preset?.id ?? ""} hasError={Boolean(e.referenceId)} disabled={!typeInfo}>
              <option value="">{typeInfo ? "Pilih" : "Pilih jenis masalah dahulu"}</option>
              {refs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField id="description" label="Deskripsi masalah" required error={e.description}>
          <Textarea id="description" defaultValue={state.values?.description ?? ""} hasError={Boolean(e.description)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="productId" label="Produk terkait (opsional)" error={e.productId}>
            <Select id="productId" defaultValue={state.values?.productId ?? ""}>
              <option value="">-</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
          </FormField>
          <FormField id="quantity" label="Jumlah bermasalah" error={e.quantity}>
            <Input id="quantity" inputMode="numeric" defaultValue={state.values?.quantity ?? ""} hasError={Boolean(e.quantity)} />
          </FormField>
        </div>
        <ImagePicker label="Bukti foto (opsional)" error={e.image} />
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="outline">Batal</ButtonLink>
        <SubmitButton>Kirim laporan</SubmitButton>
      </div>
    </form>
  );
}

export function ResolveForm({ issue }) {
  const [state, action] = useActionState(resolveIssueAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader title="Tindak lanjut" description="Isi catatan bila menyelesaikan atau menutup laporan." />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="issueId" value={issue.id} />
        <FormMessage state={state} />
        <FormField id="status" label="Status" required error={e.status}>
          <Select id="status" defaultValue="" hasError={Boolean(e.status)}>
            <option value="">Pilih status</option>
            {issue.status === "Open" && <option value="Under Review">Under Review</option>}
            <option value="Resolved">Resolved</option>
            <option value="Dismissed">Dismissed</option>
          </Select>
        </FormField>
        <FormField id="note" label="Catatan" error={e.note}>
          <Textarea id="note" defaultValue={state.values?.note ?? ""} hasError={Boolean(e.note)} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Simpan</SubmitButton></div>
      </form>
    </Card>
  );
}

export function RemedyRequestForm({ issue }) {
  const [state, action] = useActionState(requestRemedyAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  const [remedy, setRemedy] = useState(state.values?.remedy ?? "");
  return (
    <Card>
      <CardHeader title="Minta penyelesaian" description="Minta supplier mengirim barang pengganti atau melakukan refund." />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="issueId" value={issue.id} />
        <FormMessage state={state} />
        <FormField id="remedy" label="Jenis penyelesaian" required error={e.remedy}>
          <Select id="remedy" value={remedy} onChange={(ev) => setRemedy(ev.target.value)} hasError={Boolean(e.remedy)}>
            <option value="">Pilih jenis</option>
            <option value="Replacement">Barang pengganti</option>
            <option value="Refund">Refund</option>
          </Select>
        </FormField>
        {remedy === "Refund" && (
          <FormField id="refundAmount" label="Nominal refund (Rp)" required error={e.refundAmount}>
            <Input id="refundAmount" inputMode="decimal" defaultValue={state.values?.refundAmount ?? ""} hasError={Boolean(e.refundAmount)} />
          </FormField>
        )}
        <FormField id="note" label="Catatan untuk supplier" error={e.note}>
          <Textarea id="note" defaultValue={state.values?.note ?? ""} hasError={Boolean(e.note)} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Kirim permintaan</SubmitButton></div>
      </form>
    </Card>
  );
}

export function RemedyRespondForm({ issue }) {
  const [state, action] = useActionState(respondRemedyAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  const replacement = issue.remedy === "Replacement";
  return (
    <Card>
      <CardHeader title={replacement ? "Kirim barang pengganti" : "Konfirmasi refund"} description={replacement ? "Isi resi dan estimasi tiba barang pengganti." : "Isi referensi pembayaran refund."} />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="issueId" value={issue.id} />
        <FormMessage state={state} />
        <FormField id="note" label={replacement ? "Nomor resi / keterangan" : "Referensi refund"} required error={e.note}>
          <Input id="note" defaultValue={state.values?.note ?? ""} hasError={Boolean(e.note)} />
        </FormField>
        {replacement && (
          <FormField id="eta" label="Estimasi tiba" required error={e.eta}>
            <Input id="eta" type="date" defaultValue={state.values?.eta ?? ""} hasError={Boolean(e.eta)} />
          </FormField>
        )}
        <div className="flex justify-end"><SubmitButton>Kirim tanggapan</SubmitButton></div>
      </form>
    </Card>
  );
}

export function RemedyCompleteForm({ issue, candidates }) {
  const [state, action] = useActionState(completeRemedyAction, INITIAL);
  useActionToast(state);
  const replacement = issue.remedy === "Replacement";
  return (
    <Card>
      <CardHeader title="Konfirmasi penerimaan" description={replacement ? "Catat barang pengganti lewat Barang Masuk (Staff) dan setujui, lalu pilih transaksinya di sini." : "Konfirmasi refund sudah Anda terima."} />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="issueId" value={issue.id} />
        <FormMessage state={state} />
        {replacement && (
          <FormField id="transactionId" label="Transaksi barang masuk (Approved)" required>
            <Select id="transactionId" defaultValue="">
              <option value="">{candidates.length ? "Pilih transaksi" : "Belum ada transaksi yang cocok"}</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.transaction_number}</option>)}
            </Select>
          </FormField>
        )}
        <div className="flex justify-end"><SubmitButton>Konfirmasi &amp; selesaikan</SubmitButton></div>
      </form>
    </Card>
  );
}
