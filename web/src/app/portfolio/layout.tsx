// page.tsx here is a client component and so cannot export metadata. This
// layout exists only to give the route a name of its own in the tab, in
// history, and in a bookmark.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Your deposits, accrued yield and open positions across every Megawatt vault.",
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
