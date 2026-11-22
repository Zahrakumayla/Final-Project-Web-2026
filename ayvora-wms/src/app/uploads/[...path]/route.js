import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_ROOT } from "@/lib/upload";

const CONTENT_TYPES = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// GET /uploads/products/xxx.png - menyajikan gambar hasil unggahan.
export async function GET(_request, { params }) {
  const { path: segments } = await params;
  const target = path.join(UPLOAD_ROOT, ...segments);
  const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()];

  // Hanya file gambar di dalam folder uploads yang boleh dibaca
  if (!contentType || !target.startsWith(UPLOAD_ROOT + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await readFile(target);
    return new Response(file, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
