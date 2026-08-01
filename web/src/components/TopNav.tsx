"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { fmtAddress } from "@/lib/format";
import { WalletModal } from "./WalletModal";
import { BrandMark } from "./BrandMark";
import { ChainSelect } from "./ChainSelect";
import { GridIcon, BriefcaseIcon, StoreIcon, WalletIcon, TrendingUpIcon, BoltIcon } from "./Icons";

// Spreadcast sits at index 2 — the centre thumb slot on a phone — because it
// is the only daily-return destination here. Everything else is browsing.
// See docs/ui-ux-rehaul.md §2.2.
const LINKS = [
  { href: "/dashboard-v2", label: "Overview", icon: TrendingUpIcon },
  { href: "/", label: "Vaults", icon: GridIcon },
  { href: "/spreadcast", label: "Spreadcast", icon: BoltIcon },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseIcon },
  { href: "/marketplace", label: "Marketplace", icon: StoreIcon },
];

export function TopNav() {
  const pathname = usePathname();
  const { connected, connecting, profile, connect } = useWallet();
  const [modal, setModal] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/vault") : pathname.startsWith(href);

  return (
    <>
      {/* <header>, not <nav>. This bar is the site banner: it carries the
          brand, the chain indicator and Connect Wallet alongside the links.
          Marking the whole thing "navigation" put those controls inside a
          navigation landmark, which is not what they are, and left the app with
          no banner landmark at all — measured 0 on all ten routes. Landmarks
          are how a screen-reader user jumps around, and "banner" is the
          conventional way to reach site-level controls like connecting a
          wallet.

          Every rule here is class-based (`.nav`, not `nav`), so the element
          name changes and nothing about the layout does. */}
      <header className="nav">
        <Link href="/" className="nav-brand">
          <BrandMark height={15} color="var(--accent)" />
          Megawatt
        </Link>

        {/* The navigation landmark now wraps only the things that navigate.
            Two, sometimes three, <nav> landmarks are on screen at once (this,
            the mobile tab bar, and Spreadcast's section bar). Unlabelled they
            all announce as plain "navigation", so the landmark list a screen
            reader user navigates by cannot tell them apart. */}
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            // aria-current, not just a class. Which page you are on was drawn
            // and nothing more — the same gap already fixed on the Spreadcast
            // section bar, still open on the app's primary navigation, which is
            // on every single page. "page" rather than "true" because these are
            // location links, not a toggle.
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`nav-link ${isActive(l.href) ? "active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="nav-spacer" />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ChainSelect />
          {connected && profile ? (
            <button className="wallet-pill" onClick={() => setModal(true)}>
              <span className="wallet-avatar" />
              <span className="num">{fmtAddress(profile.address)}</span>
              <span className="wallet-dot" />
            </button>
          ) : (
            <button className="connect-btn" onClick={connect} disabled={connecting}>
              <WalletIcon size={16} />
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {modal && <WalletModal onClose={() => setModal(false)} />}
    </>
  );
}

/* The phone tab bar, rendered AFTER the page content in layout.tsx rather than
   alongside the header here.

   It is position: fixed, so where it sits in the DOM has no effect on where it
   is drawn — but it decides where it lands in the tab order. Emitted next to
   the header, a keyboard user on a phone went: header at the top of the screen,
   then five stops at the BOTTOM of the screen, then back up to the content.
   Measured on every route at 390px as a jump from docY 778 to docY 58-395;
   desktop was unaffected because the bar is display: none there.

   DOM order now follows visual order, which is what 2.4.3 asks for and what a
   sighted keyboard user experiences directly. */
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/vault") : pathname.startsWith(href);

  return (
      <nav className="bottom-nav" aria-label="Sections">
        {LINKS.map((l) => {
          const Icon = l.icon;
          return (
            // Same for the phone tab bar. It duplicates the links above, so a
            // screen-reader user meets each destination twice and neither copy
            // said which one they were on.
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`bottom-nav-item ${isActive(l.href) ? "active" : ""}`}
            >
              <Icon size={21} />
              <span>{l.label}</span>
            </Link>
          );
        })}
      </nav>
  );
}
