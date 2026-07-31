// page.tsx here is a client component and so cannot export metadata. This
// layout exists only to give the route a name of its own in the tab, in
// history, and in a bookmark.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Buy and sell vault positions — exit early, or pick up yield at a discount.",
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
