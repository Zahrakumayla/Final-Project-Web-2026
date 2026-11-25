/** @type {import('next').NextConfig} */
const nextConfig = {
  // Supaya aplikasi (mode dev) bisa dibuka dari HP lewat IP jaringan, mis. http://192.168.1.5:3000.
  // Tanpa ini Next.js memblokir file JavaScript dari alamat selain localhost, sehingga
  // tombol menu/sidebar di HP tidak berfungsi (halaman tampil tapi tidak interaktif).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],

  // Upload gambar maksimal 2 MB lewat Server Action; beri sedikit ruang untuk field form lain.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
