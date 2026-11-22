// Validasi input autentikasi. Berupa fungsi murni (tanpa akses database)
// sehingga mudah diuji dan dipakai ulang oleh server action maupun route handler.
//
// Batas panjang mengikuti tipe kolom tabel `users` di database/ayvora.sql
// (full_name 120, email 150, phone 25, company_name 150, business_field 150).

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_MAX_LENGTH = 150;
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

// bcrypt hanya membaca 72 byte pertama password, jadi batas atas wajib ada.
const PASSWORD_MAX_BYTES = 72;
const PASSWORD_MIN_LENGTH = 8;

function readText(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Password tidak di-trim: spasi di awal/akhir adalah bagian dari password.
function readPassword(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function validateEmail(email) {
  if (!email) return "Email wajib diisi.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return "Format email tidak valid.";
  }
  return null;
}

export function validatePasswordStrength(password) {
  if (!password) return "Kata sandi wajib diisi.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Kata sandi minimal ${PASSWORD_MIN_LENGTH} karakter.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "Kata sandi terlalu panjang (maksimal 72 karakter).";
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Kata sandi harus mengandung huruf besar, huruf kecil, dan angka.";
  }
  return null;
}

// Login hanya memeriksa input tidak kosong. Aturan kekuatan password tidak
// dipakai di sini agar akun lama tetap bisa login dan pesan error tidak
// membocorkan kebijakan password.
export function validateLogin(formData) {
  const email = readText(formData, "email");
  const password = readPassword(formData, "password");
  const errors = {};

  if (!email) errors.email = "Email wajib diisi.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Format email tidak valid.";
  if (!password) errors.password = "Kata sandi wajib diisi.";

  return { data: { email, password }, errors };
}

export function validateSupplierRegistration(formData) {
  const data = {
    fullName: readText(formData, "fullName"),
    email: readText(formData, "email").toLowerCase(),
    phone: readText(formData, "phone").replace(/[\s-]/g, ""),
    companyName: readText(formData, "companyName"),
    address: readText(formData, "address"),
    businessField: readText(formData, "businessField"),
    companyDescription: readText(formData, "companyDescription"),
    categoryIds: [...new Set(formData.getAll("categoryIds").filter((v) => typeof v === "string" && v))],
    password: readPassword(formData, "password"),
    confirmPassword: readPassword(formData, "confirmPassword"),
  };
  const errors = {};

  if (!data.fullName) errors.fullName = "Nama lengkap wajib diisi.";
  else if (data.fullName.length < 3) errors.fullName = "Nama lengkap minimal 3 karakter.";
  else if (data.fullName.length > 120) errors.fullName = "Nama lengkap maksimal 120 karakter.";

  const emailError = validateEmail(data.email);
  if (emailError) errors.email = emailError;

  if (!data.phone) errors.phone = "Nomor telepon wajib diisi.";
  else if (!PHONE_PATTERN.test(data.phone)) {
    errors.phone = "Nomor telepon harus berupa 8-15 angka, boleh diawali +.";
  }

  if (!data.companyName) errors.companyName = "Nama perusahaan wajib diisi.";
  else if (data.companyName.length > 150) errors.companyName = "Nama perusahaan maksimal 150 karakter.";

  if (!data.address) errors.address = "Alamat perusahaan wajib diisi.";
  else if (data.address.length < 10) errors.address = "Alamat perusahaan minimal 10 karakter.";
  else if (data.address.length > 300) errors.address = "Alamat perusahaan maksimal 300 karakter.";

  if (!data.businessField) errors.businessField = "Jenis usaha wajib diisi.";
  else if (data.businessField.length > 150) errors.businessField = "Jenis usaha maksimal 150 karakter.";

  if (!data.companyDescription) errors.companyDescription = "Deskripsi perusahaan wajib diisi.";
  else if (data.companyDescription.length < 10) {
    errors.companyDescription = "Deskripsi perusahaan minimal 10 karakter.";
  } else if (data.companyDescription.length > 1000) {
    errors.companyDescription = "Deskripsi perusahaan maksimal 1000 karakter.";
  }

  if (data.categoryIds.length === 0) errors.categoryIds = "Pilih minimal satu kategori produk.";
  else if (!data.categoryIds.every((id) => UUID_PATTERN.test(id))) errors.categoryIds = "Kategori tidak valid.";

  const passwordError = validatePasswordStrength(data.password);
  if (passwordError) errors.password = passwordError;

  if (!data.confirmPassword) errors.confirmPassword = "Konfirmasi kata sandi wajib diisi.";
  else if (!errors.password && data.confirmPassword !== data.password) {
    errors.confirmPassword = "Konfirmasi kata sandi tidak cocok.";
  }

  return { data, errors };
}

// Nilai yang aman dikembalikan ke form setelah error. Password sengaja dibuang.
export function toSafeValues(data) {
  const { password, confirmPassword, ...safe } = data;
  return safe;
}
