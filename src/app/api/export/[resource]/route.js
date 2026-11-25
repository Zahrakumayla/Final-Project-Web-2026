import { getCurrentUser } from "@/lib/auth/guards";
import { csvResponse } from "@/lib/csv";
import { getExport } from "@/services/exports";

// GET /api/export/<resource>?q=&status=... - unduh CSV sesuai filter.
// Hak akses diperiksa di server per resource & role; Admin tidak dapat mengekspor data transaksi.
export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "Silakan masuk terlebih dahulu." }, { status: 401 });

    const { resource } = await params;
    const search = Object.fromEntries(new URL(request.url).searchParams.entries());
    const result = await getExport(user, resource, search);
    if (!result) return Response.json({ message: "Data tidak ditemukan." }, { status: 404 });
    if (result.forbidden) return Response.json({ message: "Anda tidak memiliki akses untuk mengekspor data ini." }, { status: 403 });

    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(`ayvora-${resource}-${stamp}.csv`, result.csv);
  } catch (error) {
    console.error("GET /api/export gagal:", error);
    return Response.json({ message: "Terjadi kesalahan pada server." }, { status: 500 });
  }
}
