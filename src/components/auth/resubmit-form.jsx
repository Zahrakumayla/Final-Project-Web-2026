"use client";

import { useActionState } from "react";
import { resubmitSupplierAction } from "@/actions/auth";
import { FormField, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Form perbaikan data untuk supplier yang ditolak. Akun (email & kata sandi) tidak berubah.
export default function ResubmitForm({ applicant, categories }) {
  const [state, action] = useActionState(resubmitSupplierAction, INITIAL);
  const e = state.errors ?? {};
  const v = (name, fallback) => state.values?.[name] ?? fallback ?? "";
  const selected = state.values?.categoryIds ?? applicant.categories.map((c) => c.id);

  return (
    <form action={action} noValidate className="mt-5 space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="fullName" label="Nama penanggung jawab" required error={e.fullName}><Input id="fullName" defaultValue={v("fullName", applicant.full_name)} hasError={Boolean(e.fullName)} /></FormField>
        <FormField id="phone" label="Nomor telepon" required error={e.phone}><Input id="phone" type="tel" defaultValue={v("phone", applicant.phone)} hasError={Boolean(e.phone)} /></FormField>
        <FormField id="companyName" label="Nama perusahaan" required error={e.companyName}><Input id="companyName" defaultValue={v("companyName", applicant.company_name)} hasError={Boolean(e.companyName)} /></FormField>
        <FormField id="businessField" label="Jenis usaha" required error={e.businessField}><Input id="businessField" defaultValue={v("businessField", applicant.business_field)} hasError={Boolean(e.businessField)} /></FormField>
        <FormField id="address" label="Alamat perusahaan" required error={e.address}><Input id="address" defaultValue={v("address", applicant.address)} hasError={Boolean(e.address)} /></FormField>
        <FormField id="websiteUrl" label="Website (opsional)" error={e.websiteUrl}><Input id="websiteUrl" defaultValue={v("websiteUrl", applicant.website_url)} placeholder="https://perusahaan.co.id" hasError={Boolean(e.websiteUrl)} /></FormField>
      </div>
      <FormField id="companyDescription" label="Deskripsi perusahaan" required error={e.companyDescription}>
        <Textarea id="companyDescription" defaultValue={v("companyDescription", applicant.company_description)} className="min-h-20" hasError={Boolean(e.companyDescription)} />
      </FormField>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Kategori produk <span className="text-destructive">*</span></legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
              <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={selected.includes(c.id)} className="size-4 accent-primary" />
              {c.name}
            </label>
          ))}
        </div>
        {e.categoryIds && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{e.categoryIds}</p>}
      </fieldset>
      <div className="flex justify-end"><SubmitButton pendingLabel="Mengirim...">Ajukan Ulang</SubmitButton></div>
    </form>
  );
}
