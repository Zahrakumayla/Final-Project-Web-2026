import { AUTH_MESSAGES } from "@/lib/auth/config";
import { jsonToFormData, readJson } from "@/lib/auth/http";
import { registerSupplier } from "@/lib/auth/service";
import { validateSupplierRegistration } from "@/lib/validation/auth";

// POST /api/auth/register/supplier - daftar akun supplier baru (status awal: Pending).
export async function POST(request) {
  const body = await readJson(request);
  if (!body) return Response.json({ message: "Body harus berupa JSON." }, { status: 400 });

  const { data, errors } = validateSupplierRegistration(jsonToFormData(body));
  if (Object.keys(errors).length > 0) return Response.json({ message: "Data tidak valid.", errors }, { status: 400 });

  try {
    const result = await registerSupplier(data);
    if (!result.ok) {
      const status = result.errors.email ? 409 : 400;
      return Response.json({ message: "Registrasi gagal.", errors: result.errors }, { status });
    }
  } catch (error) {
    console.error("POST /api/auth/register/supplier gagal:", error);
    return Response.json({ message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }

  return Response.json(
    { message: "Pendaftaran berhasil. Akun Anda menunggu persetujuan admin." },
    { status: 201 },
  );
}
