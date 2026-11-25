"use client";

import { PhotoLink } from "@/components/ui/photo-viewer";
import { useState } from "react";
import { Icon } from "@/components/shared/icons";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png"];

// Input gambar dengan pratinjau, validasi tipe/ukuran, dan opsi menghapus gambar lama.
export function ImagePicker({ name = "image", label = "Gambar", required = false, currentUrl, error }) {
  const [preview, setPreview] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [remove, setRemove] = useState(false);

  function handleChange(event) {
    const file = event.target.files?.[0];
    setClientError(null);
    if (!file) return setPreview(null);

    if (!TYPES.includes(file.type)) {
      event.target.value = "";
      setPreview(null);
      return setClientError("Format gambar harus JPG atau PNG.");
    }
    if (file.size > MAX_BYTES) {
      event.target.value = "";
      setPreview(null);
      return setClientError("Ukuran gambar maksimal 2 MB.");
    }
    setPreview(URL.createObjectURL(file));
    setRemove(false);
  }

  const shown = remove ? null : (preview ?? currentUrl);
  const message = clientError ?? error;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <PhotoLink src={shown} alt="Pratinjau gambar" className="size-full cursor-pointer">
              <img src={shown} alt="Pratinjau gambar" className="size-full object-cover" />
            </PhotoLink>
          ) : (
            <Icon name="image" className="size-8" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <input
            type="file"
            name={name}
            accept="image/jpeg,image/png"
            onChange={handleChange}
            className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
          />
          <p className="text-xs text-muted-foreground">JPG atau PNG. Maksimal 2 MB.</p>
          {currentUrl && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name={`remove_${name}`} value="1" checked={remove} onChange={(event) => setRemove(event.target.checked)} className="size-4 accent-primary" />
              Hapus gambar saat ini
            </label>
          )}
        </div>
      </div>
      {message && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{message}</p>}
    </div>
  );
}
