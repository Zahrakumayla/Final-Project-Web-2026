import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Gambar yang diunggah pengguna disimpan di folder `uploads/` (di luar public/)
// dan disajikan lewat route /uploads/... (lihat src/app/uploads/[...path]/route.js).
// Alasannya: file yang ditambahkan ke public/ saat server berjalan tidak selalu
// ikut disajikan pada mode production.

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Memeriksa isi file (magic bytes), bukan hanya tipe yang dikirim browser.
function detectType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function isUploadedFile(value) {
  return typeof value === "object" && value !== null && typeof value.arrayBuffer === "function" && value.size > 0;
}

// Mengembalikan { url } jika berhasil, atau { error } jika file tidak valid.
export async function saveImage(file, folder) {
  if (file.size > MAX_IMAGE_BYTES) return { error: "Ukuran gambar maksimal 2 MB." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectType(bytes);
  if (!type || !EXTENSIONS[type]) return { error: "Format gambar harus JPG, PNG, atau WebP." };

  const fileName = `${randomUUID()}.${EXTENSIONS[type]}`;
  const directory = path.join(UPLOAD_ROOT, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), bytes);

  return { url: `/uploads/${folder}/${fileName}` };
}

// Menghapus file hasil unggahan. Gambar bawaan (public/images/...) tidak disentuh.
export async function deleteUploadedImage(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  const target = path.join(UPLOAD_ROOT, url.slice("/uploads/".length));
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) return; // cegah path traversal
  await unlink(target).catch(() => {});
}
