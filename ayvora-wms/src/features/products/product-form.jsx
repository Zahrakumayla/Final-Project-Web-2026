"use client";

import { useActionState } from "react";
import { createProductAction, updateProductAction } from "@/actions/products";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { SubmitButton } from "@/components/ui/submit-button";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Satu form untuk tambah & ubah. Saat mengubah: SKU terkunci dan stok tidak ditampilkan.
export function ProductForm({ mode, product, categories, racks, cancelHref }) {
  const [state, action] = useActionState(mode === "create" ? createProductAction : updateProductAction, INITIAL);
  const e = state.errors ?? {};
  const v = (name, fallback = "") => state.values?.[name] ?? fallback;
  const edit = mode === "edit";

  return (
    <form action={action} className="space-y-6" noValidate>
      {edit && <input type="hidden" name="productId" value={product.product_id} />}
      <FormMessage state={state} />

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Informasi produk</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="sku" label="SKU" required={!edit} error={e.sku} hint={edit ? "SKU tidak dapat diubah." : "Kode unik, mis. AYV-PAP-006."}>
            <Input id="sku" defaultValue={edit ? product.sku : v("sku")} readOnly={edit} hasError={Boolean(e.sku)} className="uppercase" />
          </FormField>
          <FormField id="name" label="Nama produk" required error={e.name}>
            <Input id="name" defaultValue={v("name", product?.product_name)} hasError={Boolean(e.name)} />
          </FormField>
          <FormField id="categoryId" label="Kategori" required error={e.categoryId}>
            <Select id="categoryId" defaultValue={v("categoryId", product?.category_id)} hasError={Boolean(e.categoryId)}>
              <option value="">Pilih kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField id="unit" label="Satuan" required error={e.unit} hint="Mis. pcs, roll, pack.">
            <Input id="unit" defaultValue={v("unit", product?.unit ?? "pcs")} hasError={Boolean(e.unit)} />
          </FormField>
        </div>
        <FormField id="description" label="Deskripsi" error={e.description}>
          <Textarea id="description" defaultValue={v("description", product?.description ?? "")} />
        </FormField>
        <ImagePicker label="Gambar produk" currentUrl={edit ? product.image_url : null} error={e.image} />
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Harga & batas stok</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="buyPrice" label="Harga beli (Rp)" required error={e.buyPrice}>
            <Input id="buyPrice" inputMode="decimal" defaultValue={v("buyPrice", product?.buy_price)} hasError={Boolean(e.buyPrice)} />
          </FormField>
          <FormField id="sellPrice" label="Harga jual (Rp)" required error={e.sellPrice}>
            <Input id="sellPrice" inputMode="decimal" defaultValue={v("sellPrice", product?.sell_price)} hasError={Boolean(e.sellPrice)} />
          </FormField>
          <FormField id="minStock" label="Stok minimum (Severe)" required error={e.minStock} hint="Stok di bawah atau sama dengan angka ini berstatus Severe.">
            <Input id="minStock" inputMode="numeric" defaultValue={v("minStock", product?.min_stock ?? "0")} hasError={Boolean(e.minStock)} />
          </FormField>
          <FormField id="lowStock" label="Batas stok rendah (Low)" required error={e.lowStock} hint="Harus lebih besar dari stok minimum.">
            <Input id="lowStock" inputMode="numeric" defaultValue={v("lowStock", product?.low_stock ?? "")} hasError={Boolean(e.lowStock)} />
          </FormField>
        </div>
      </Card>

      {!edit && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Stok awal (opsional)</h2>
            <p className="text-sm text-muted-foreground">Hanya bisa diisi saat produk dibuat. Setelah itu stok berubah lewat transaksi barang masuk/keluar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="initialStock" label="Jumlah stok awal" error={e.initialStock}>
              <Input id="initialStock" inputMode="numeric" defaultValue={v("initialStock", "0")} hasError={Boolean(e.initialStock)} />
            </FormField>
            <FormField id="rackId" label="Rak penyimpanan" error={e.rackId}>
              <Select id="rackId" defaultValue={v("rackId")} hasError={Boolean(e.rackId)}>
                <option value="">Pilih rak</option>
                {racks.map((r) => <option key={r.id} value={r.id}>{r.rack_code}</option>)}
              </Select>
            </FormField>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="outline">Batal</ButtonLink>
        <SubmitButton>{edit ? "Simpan perubahan" : "Simpan produk"}</SubmitButton>
      </div>
    </form>
  );
}
