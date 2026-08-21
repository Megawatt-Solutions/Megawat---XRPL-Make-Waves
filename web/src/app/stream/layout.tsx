import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stream Vault demo",
  description:
    "On-chain demo of the Stream Vault: pre-deposit escrow, PV-parity conversion, milestone drawdowns, revenue sweeps and NAV — on Base Sepolia.",
};

export default function StreamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
