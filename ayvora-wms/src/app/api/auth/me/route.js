import { AUTH_MESSAGES } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/guards";

// GET /api/auth/me - data pengguna yang sedang login (role dibaca dari database).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: AUTH_MESSAGES.NOT_LOGGED_IN }, { status: 401 });
    return Response.json({ user });
  } catch (error) {
    console.error("GET /api/auth/me gagal:", error);
    return Response.json({ message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
