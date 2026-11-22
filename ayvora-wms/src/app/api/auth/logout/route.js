import { AUTH_MESSAGES } from "@/lib/auth/config";
import { endSession } from "@/lib/auth/session";

// POST /api/auth/logout - cabut sesi di database dan hapus cookie.
export async function POST() {
  try {
    await endSession();
    return Response.json({ message: "Logout berhasil." });
  } catch (error) {
    console.error("POST /api/auth/logout gagal:", error);
    return Response.json({ message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
