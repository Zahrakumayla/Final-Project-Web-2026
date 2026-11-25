"use client";

import { useActionState, useState } from "react";
import { createProductAction, updateProductAction } from "@/actions/products";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { ImagePicker } from "@/components/ui/image-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { StockBadge } from "@/components/ui/status-badges";
import { LIMITS, PRODUCT_UNITS } from "@/lib/validation/product";

const INITIAL = { status: "idle", errors: {}, values: {} };

// Satu form untuk tambah & ubah. Saat mengubah: SKU terkunci dan stok tidak ditampilkan.
export function ProductForm({ mode, product, categories, racks, existing = [], cancelHref }) {
  const [state, action] = useActionState(mode === "create" ? createProductAction : updateProductAction, INITIAL);
  const e = state.errors ?? {};
  const v = (name, fallback = "") => state.values?.[name] ?? fallback;
  const edit = mode === "edit";
  const [categoryId, setCategoryId] = useState(() => v("categoryId", product?.category_id ?? ""));
  const sameCategory = existing.filter((p) => p.category_id === categoryId && p.product_id !== product?.product_id);
  const units = PRODUCT_UNITS.includes(product?.unit) || !product?.unit ? PRODUCT_UNITS : [product.unit, ...PRODUCT_UNITS];

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
            <Select id="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} hasError={Boolean(e.categoryId)}>
              <option value="">Pilih kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField id="unit" label="Satuan jumlah" required error={e.unit} >
            <Select id="unit" defaultValue={v("unit", product?.unit ?? "pcs")} hasError={Boolean(e.unit)}>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField id="description" label="Deskripsi" error={e.description}>
          <Textarea id="description" defaultValue={v("description", product?.description ?? "")} />
        </FormField>
        <ImagePicker label="Gambar produk" required currentUrl={edit ? product.image_url : null} error={e.image} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-base font-semibold">Stok saat ini (acuan)</h2>
        {edit ? (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Stok fisik</dt><dd className="text-lg font-semibold">{product.current_stock} {product.unit}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Dialokasikan</dt><dd className="text-lg font-semibold">{product.allocated_stock}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Tersedia</dt><dd className="text-lg font-semibold">{product.available_stock}</dd></div>
          </dl>
        ) : !categoryId ? (
          <p className="text-sm text-muted-foreground">Pilih kategori untuk melihat stok produk sejenis.</p>
        ) : sameCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada produk lain di kategori ini.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {sameCategory.slice(0, 8).map((p) => (
              <li key={p.product_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="font-medium">{p.product_name}</span> <span className="text-xs text-muted-foreground">{p.sku}</span></span>
                <span className="flex items-center gap-2"><span>Tersedia <span className="font-semibold">{p.available_stock}</span> {p.unit}</span><StockBadge status={p.stock_status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Harga & batas stok</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="buyPrice" label="Harga beli (Rp)" required error={e.buyPrice} hint={`Rp${LIMITS.priceMin.toLocaleString("id-ID")} - Rp${LIMITS.priceMax.toLocaleString("id-ID")}`}>
            <Input id="buyPrice" inputMode="decimal" placeholder="mis. 2500" defaultValue={v("buyPrice", product?.buy_price)} hasError={Boolean(e.buyPrice)} />
          </FormField>
          <FormField id="sellPrice" label="Harga jual (Rp)" required error={e.sellPrice} hint="Minimal sama dengan harga beli">
            <Input id="sellPrice" inputMode="decimal" defaultValue={v("sellPrice", product?.sell_price)} hasError={Boolean(e.sellPrice)} />
          </FormField>
          <FormField id="minStock" label="Stok minimum (status Kritis)" required error={e.minStock} hint={`Maks ${LIMITS.thresholdMax.toLocaleString("id-ID")}`}>
            <Input id="minStock" inputMode="numeric" defaultValue={v("minStock", product?.min_stock ?? "0")} hasError={Boolean(e.minStock)} />
          </FormField>
          <FormField id="lowStock" label="Batas stok rendah (status Menipis)" required error={e.lowStock} hint="Lebih besar dari stok minimum">
            <Input id="lowStock" inputMode="numeric" defaultValue={v("lowStock", product?.low_stock ?? "")} hasError={Boolean(e.lowStock)} />
          </FormField>
        </div>
      </Card>

      {!edit && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Stok awal (opsional)</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="initialStock" label="Jumlah stok awal" error={e.initialStock}>
              <Input id="initialStock" inputMode="numeric" defaultValue={v("initialStock", "0")} hasError={Boolean(e.initialStock)} />
            </FormField>
            <FormField id="rackId" label="Rak penyimpanan" error={e.rackId}>
              <Select id="rackId" defaultValue={v("rackId")} hasError={Boolean(e.rackId)}>
                <option value="">Pilih rak</option>
                {racks.map((r) => <option key={r.id} value={r.id}>{r.rack_code} (terisi {r.stored} unit, {r.product_count} produk)</option>)}
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
