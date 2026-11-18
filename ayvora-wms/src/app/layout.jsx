import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins dimuat sekali di sini dan diteruskan ke seluruh halaman lewat
// CSS variable --font-poppins (lihat --font-sans di globals.css).
// Italic dibutuhkan oleh tagline hero dan teks footer.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata = {
  title: {
    default: "AYVORA - Ayla Innovation Warehouse",
    template: "%s | AYVORA",
  },
  description:
    "AYVORA adalah platform pengelolaan gudang dan persediaan untuk distributor kemasan ramah lingkungan.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={poppins.variable}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
