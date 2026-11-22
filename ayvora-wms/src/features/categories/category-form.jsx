"use client";

import { useActionState } from "react";
import { createCategoryAction, updateCategoryAction } from "@/actions/categories";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { SubmitButton } from "@/components/ui/submit-button";

const INITIAL = { status: "idle", errors: {}, values: {} };

export function CategoryForm({ category, cancelHref }) {
  const edit = Boolean(category);
  const [state, action] = useActionState(edit ? updateCategoryAction : createCategoryAction, INITIAL);
  const e = state.errors ?? {};

  return (
    <form action={action} className="space-y-6" noValidate>
      {edit && <input type="hidden" name="categoryId" value={category.id} />}
      <FormMessage state={state} />
      <Card className="space-y-4">
        <FormField id="name" label="Nama kategori" required error={e.name}>
          <Input id="name" defaultValue={state.values?.name ?? category?.name ?? ""} hasError={Boolean(e.name)} />
        </FormField>
        <FormField id="description" label="Deskripsi" error={e.description}>
          <Textarea id="description" defaultValue={state.values?.description ?? category?.description ?? ""} />
        </FormField>
        <ImagePicker label="Gambar kategori" currentUrl={category?.image_url} error={e.image} />
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="outline">Batal</ButtonLink>
        <SubmitButton>{edit ? "Simpan perubahan" : "Simpan kategori"}</SubmitButton>
      </div>
    </form>
  );
}
