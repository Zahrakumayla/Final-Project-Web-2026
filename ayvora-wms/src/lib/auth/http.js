// Pembantu kecil untuk Route Handler (API JSON).

// Validator memakai FormData; body JSON diubah dulu agar aturan validasinya sama dengan form.
export function jsonToFormData(body) {
  const formData = new FormData();
  if (!body || typeof body !== "object") return formData;

  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) value.forEach((item) => formData.append(key, String(item)));
    else if (value !== null && value !== undefined) formData.append(key, String(value));
  }
  return formData;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
