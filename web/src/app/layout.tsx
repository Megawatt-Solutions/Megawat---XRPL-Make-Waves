import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/wallet";
import { TopNav } from "@/components/TopNav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Brand loads JetBrains Mono at 400/500 only. Anything heavier would be
// synthesised by the browser, and faux-bold monospace reads as a rendering
// bug at display sizes. globals.css caps every mono rule at 500 to match.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Without viewportFit: "cover" the env(safe-area-inset-*) values evaluate to
// 0, which made the max(10px, env(...)) padding in .bottom-nav dead code and
// --nav-h-safe wrong on notched devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030907",
};

export const metadata: Metadata = {
  title: "Megawatt — BESS Vaults",
  description:
    "Invest in Battery Energy Storage Systems, earn yield, and trade your position — on the XRP Ledger.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      
      <body suppressHydrationWarning>
        <AppProviders>
          <TopNav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
