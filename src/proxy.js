import { NextResponse } from "next/server";
import { LOGIN_PATH } from "@/lib/constants";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";

// Penjaga halaman yang wajib login. Di sini hanya cek CEPAT: ada cookie sesi atau tidak.
// Keabsahan sesi dan role yang sebenarnya diperiksa di server lewat requireUser()/requireRole(),
// karena proxy tidak seharusnya memutuskan hak akses berdasarkan cookie saja.
//
// Catatan versi: Next.js 16 memakai file `proxy.js` dengan fungsi `proxy`.
// Jika project memakai Next.js 15, ubah nama file menjadi `middleware.js` dan fungsinya menjadi `middleware`.
export function proxy(request) {
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }
  return NextResponse.next();
}

// Seluruh area dashboard (per role) wajib login.
export const config = {
  matcher: ["/admin/:path*", "/manager/:path*", "/staff/:path*", "/supplier/:path*"],
};
