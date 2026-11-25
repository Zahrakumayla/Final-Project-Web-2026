import { AUTH_MESSAGES } from "@/lib/auth/config";
import { jsonToFormData, readJson } from "@/lib/auth/http";
import { login } from "@/lib/auth/service";
import { getCurrentUser } from "@/lib/auth/guards";
import { getHomePath } from "@/lib/permissions";
import { validateLogin } from "@/lib/validation/auth";

// POST /api/auth/login - verifikasi email + password, cek status supplier, lalu pasang cookie sesi.
export async function POST(request) {
  const body = await readJson(request);
  if (!body) return Response.json({ message: "Body harus berupa JSON." }, { status: 400 });

  const { data, errors } = validateLogin(jsonToFormData(body));
  if (Object.keys(errors).length > 0) return Response.json({ message: "Data tidak valid.", errors }, { status: 400 });

  try {
    const result = await login(data.email.toLowerCase(), data.password);
    if (!result.ok) {
      // 401 = kredensial salah, 403 = kredensial benar tetapi akun supplier belum boleh masuk.
      const status = result.code === "INVALID_CREDENTIALS" ? 401 : 403;
      return Response.json({ message: result.message, code: result.code }, { status });
    }

    const user = await getCurrentUser();
    return Response.json({ message: "Login berhasil.", user, redirectTo: getHomePath(user.role) });
  } catch (error) {
    console.error("POST /api/auth/login gagal:", error);
    return Response.json({ message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
