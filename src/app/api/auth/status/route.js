import { AUTH_MESSAGES } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/guards";

// GET /api/auth/status - cek ringan: sudah login atau belum (selalu 200).
export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({ authenticated: Boolean(user), role: user?.role ?? null });
  } catch (error) {
    console.error("GET /api/auth/status gagal:", error);
    return Response.json({ message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
