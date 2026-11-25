"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction } from "@/actions/profile";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function ProfileForm({ profile }) {
  const [state, action] = useActionState(updateProfileAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  const v = (name, fallback) => state.values?.[name] ?? fallback ?? "";
  const supplier = profile.role === "supplier";
  return (
    <Card>
      <CardHeader title="Data diri" />
      <form action={action} className="space-y-4" noValidate>
        <FormMessage state={state} />
        <ImagePicker label="Foto profil" currentUrl={profile.avatar_url} error={e.image} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fullName" label="Nama lengkap" required error={e.fullName}><Input id="fullName" defaultValue={v("fullName", profile.full_name)} hasError={Boolean(e.fullName)} /></FormField>
          <FormField id="email" label="Email"><Input id="email" value={profile.email} readOnly /></FormField>
          <FormField id="phone" label="Telepon" error={e.phone}><Input id="phone" inputMode="tel" defaultValue={v("phone", profile.phone)} hasError={Boolean(e.phone)} /></FormField>
        </div>
        {supplier && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="companyName" label="Nama perusahaan" required error={e.companyName}><Input id="companyName" defaultValue={v("companyName", profile.company_name)} hasError={Boolean(e.companyName)} /></FormField>
              <FormField id="businessField" label="Bidang usaha"><Input id="businessField" defaultValue={v("businessField", profile.business_field)} /></FormField>
              <FormField id="websiteUrl" label="Website" error={e.websiteUrl}><Input id="websiteUrl" defaultValue={v("websiteUrl", profile.website_url)} hasError={Boolean(e.websiteUrl)} /></FormField>
            </div>
            <FormField id="address" label="Alamat"><Textarea id="address" defaultValue={v("address", profile.address)} /></FormField>
            <FormField id="companyDescription" label="Deskripsi perusahaan"><Textarea id="companyDescription" defaultValue={v("companyDescription", profile.company_description)} /></FormField>
          </>
        )}
        <div className="flex justify-end"><SubmitButton>Simpan profil</SubmitButton></div>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader title="Ganti kata sandi" />
      <form action={action} className="space-y-4" noValidate key={state.status === "success" ? "done" : "form"}>
        <FormMessage state={state} />
        <FormField id="currentPassword" label="Kata sandi saat ini" required error={e.currentPassword}><Input id="currentPassword" type="password" autoComplete="current-password" hasError={Boolean(e.currentPassword)} /></FormField>
        <FormField id="newPassword" label="Kata sandi baru" required error={e.newPassword}><Input id="newPassword" type="password" autoComplete="new-password" hasError={Boolean(e.newPassword)} /></FormField>
        <FormField id="confirmPassword" label="Ulangi kata sandi baru" required error={e.confirmPassword}><Input id="confirmPassword" type="password" autoComplete="new-password" hasError={Boolean(e.confirmPassword)} /></FormField>
        <div className="flex justify-end"><SubmitButton>Ganti kata sandi</SubmitButton></div>
      </form>
    </Card>
  );
}
