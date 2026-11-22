import bcrypt from "bcryptjs";

// Cost 10 sama dengan hash akun dummy di database (gen_salt('bf', 10)).
const BCRYPT_COST = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Hash palsu untuk email yang tidak terdaftar: kita tetap menghitung bcrypt
// supaya waktu respons sama, sehingga penyerang tidak bisa menebak email
// terdaftar lewat selisih waktu.
let dummyHashPromise;
export async function verifyAgainstDummy(password) {
  dummyHashPromise ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummyHashPromise);
}
