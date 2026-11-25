"use client";

import { useActionState } from "react";
import { createUserAction, resetPasswordAction } from "@/actions/users";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { ROLE_OPTIONS } from "@/lib/labels";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function UserForm() {
  const [state, action] = useActionState(createUserAction, INITIAL);
  const e = state.errors ?? {};
  const v = (name) => state.values?.[name] ?? "";
  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="fullName" label="Nama lengkap" required error={e.fullName}><Input id="fullName" defaultValue={v("fullName")} hasError={Boolean(e.fullName)} /></FormField>
          <FormField id="role" label="Role" required error={e.role}>
            <Select id="role" defaultValue={v("role")} hasError={Boolean(e.role)}>
              <option value="">Pilih role</option>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </FormField>
          <FormField id="email" label="Email" required error={e.email}><Input id="email" type="email" defaultValue={v("email")} hasError={Boolean(e.email)} /></FormField>
          <FormField id="phone" label="Telepon" error={e.phone}><Input id="phone" inputMode="tel" defaultValue={v("phone")} hasError={Boolean(e.phone)} /></FormField>
          <FormField id="password" label="Kata sandi awal" required error={e.password} hint="Minimal 8 karakter: huruf besar, huruf kecil, angka, dan simbol." className="sm:col-span-2">
            <Input id="password" type="password" autoComplete="new-password" hasError={Boolean(e.password)} />
          </FormField>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/admin/users" variant="outline">Batal</ButtonLink>
        <SubmitButton>Buat akun</SubmitButton>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ userId }) {
  const [state, action] = useActionState(resetPasswordAction, INITIAL);
  useActionToast(state);
  const e = state.errors ?? {};
  return (
    <Card>
      <CardHeader title="Reset kata sandi" />
      <form action={action} className="space-y-4" noValidate key={state.status === "success" ? Date.now() : "form"}>
        <input type="hidden" name="userId" value={userId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="newPassword" label="Kata sandi baru" required error={e.newPassword}><Input id="newPassword" type="password" autoComplete="new-password" hasError={Boolean(e.newPassword)} /></FormField>
          <FormField id="confirmPassword" label="Ulangi kata sandi" required error={e.confirmPassword}><Input id="confirmPassword" type="password" autoComplete="new-password" hasError={Boolean(e.confirmPassword)} /></FormField>
        </div>
        <div className="flex justify-end"><SubmitButton>Reset kata sandi</SubmitButton></div>
      </form>
    </Card>
  );
}
