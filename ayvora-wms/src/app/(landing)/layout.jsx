import LandingBackground from "@/components/landing/landing-background";
import Navbar from "@/components/landing/navbar";
import SiteFooter from "@/components/landing/site-footer";

// Kerangka bersama untuk halaman publik (Beranda & Tentang Kami):
// background + navbar + konten halaman + footer.
// Berada di route group (landing) supaya halaman login dan dashboard
// nantinya TIDAK ikut memakai navbar/footer ini. Nama "(landing)" tidak
// muncul di URL.
export default function LandingLayout({ children }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      <LandingBackground />
      <Navbar />
      <main className="relative flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
