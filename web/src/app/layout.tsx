import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/lib/wallet";
import { TopNav } from "@/components/TopNav";
import { Onboarding } from "@/components/Onboarding";

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

// Every route in the app used to share one of two titles — "Megawatt — BESS
// Vaults" for the whole vaults half including each individual vault, and
// "Spreadcast — Megawatt" for all four game routes. Six vault pages open in six
// tabs were indistinguishable, browser history was a wall of the same string,
// and a bookmarked vault said nothing about which vault.
//
// The template gives each page a name of its own without every file having to
// repeat the brand. Pages set `title: "Portfolio"` and get "Portfolio —
// Megawatt"; `default` covers routes that set nothing.
export const metadata: Metadata = {
  title: {
    template: "%s — Megawatt",
    default: "Megawatt — BESS Vaults",
  },
  description:
    "Invest in Battery Energy Storage Systems, earn yield, and trade your position — on the XRP Ledger.",
  applicationName: "Megawatt",
  // There were no og: tags at all, so a link pasted into Slack, WhatsApp or
  // anywhere else rendered as a bare URL with no preview — for a product whose
  // vault links are meant to be shared, that is the link doing no work.
  // No og:image yet: that needs a real brand asset, not one invented here.
  openGraph: {
    type: "website",
    siteName: "Megawatt",
    title: "Megawatt — BESS Vaults",
    description:
      "Invest in Battery Energy Storage Systems, earn yield, and trade your position — on the XRP Ledger.",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      
      <body suppressHydrationWarning>
        <AppProviders>
          {/* WCAG 2.4.1 Bypass Blocks — Level A, and it was missing.
              Measured before this: 7 tabs to reach page content on / and
              /portfolio, 11 on /spreadcast because of the section bar. A
              keyboard user paid that toll on EVERY navigation, since the same
              nav repeats on every route.

              First focusable in the document, invisible until focused. The
              target is a wrapper rather than each page's own <main>, so it
              works no matter what a route renders and no page has to remember
              to opt in. */}
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <TopNav />
          {/* tabIndex -1 so it can accept programmatic focus from the skip
              link without joining the tab order itself. */}
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
          {/* Inside AppProviders (it reads useWallet) and last in DOM/tab
              order, so its focus trap sits at the end of the document. */}
          <Onboarding />
        </AppProviders>
      </body>
    </html>
  );
}
