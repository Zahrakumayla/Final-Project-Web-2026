import { Pool, types } from "pg";

// Pengaturan pembacaan tipe data dari PostgreSQL:
//  - BIGINT (COUNT, SUM) dan NUMERIC dibaca sebagai angka, bukan teks
//  - DATE dibaca sebagai teks "YYYY-MM-DD" agar tidak bergeser karena zona waktu
types.setTypeParser(20, (value) => parseInt(value, 10));
types.setTypeParser(1700, (value) => parseFloat(value));
types.setTypeParser(1082, (value) => value);

// Satu pool koneksi dipakai ulang. Saat `npm run dev`, Next me-reload modul
// berkali-kali, jadi pool disimpan di globalThis agar koneksi tidak menumpuk.
const globalForDb = globalThis;

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diatur. Salin .env.example menjadi .env.local lalu isi nilainya.");
  }
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}

function getPool() {
  if (!globalForDb.__ayvoraPool) globalForDb.__ayvoraPool = createPool();
  return globalForDb.__ayvoraPool;
}

// Query biasa. Selalu pakai parameter ($1, $2, ...) - JANGAN menyambung string.
export function query(text, params) {
  return getPool().query(text, params);
}

// Menjalankan beberapa query sebagai satu kesatuan: semua berhasil atau semua dibatalkan.
export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
