// page.tsx here is a client component and so cannot export metadata. This
// layout exists only to give the route a name of its own in the tab, in
// history, and in a bookmark.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Buy and sell vault positions - exit early, or pick up yield at a discount.",
  // og:title does not follow `title`; it has to be set. Done here but not in
  // portfolio/layout.tsx on purpose — the marketplace is a public page worth
  // naming in a shared preview, a portfolio is somebody's own position and the
  // generic card is the better thing for a link to it to say.
  openGraph: {
    title: "Marketplace - Megawatt",
    description: "Buy and sell vault positions - exit early, or pick up yield at a discount.",
  },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
