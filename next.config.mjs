/** @type {import('next').NextConfig} */
const nextConfig = {
  // Upload gambar maksimal 2 MB lewat Server Action; beri sedikit ruang untuk field form lain.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
