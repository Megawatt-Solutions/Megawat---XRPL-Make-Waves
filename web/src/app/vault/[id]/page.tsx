import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVault, VAULTS } from "@/lib/vaults";
import { fmtPower, fmtEnergy } from "@/lib/format";
import { VaultDetail } from "@/components/VaultDetail";

export function generateStaticParams() {
  return VAULTS.map((v) => ({ id: v.id }));
}

// These are the URLs that actually get shared, and all six of them carried the
// same title as the home page — six identical tabs, six identical bookmarks,
// and a pasted link that said nothing about which vault it pointed at.
//
// Everything here is read from the existing vault record. Nothing is computed,
// rounded or asserted that the page itself does not already show.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vault = getVault(id);
  if (!vault) return { title: "Vault not found" };

  // fmtPower/fmtEnergy, not arithmetic here. Dividing by 1000 and rounding to
  // one decimal described Ljubljana's 350 kW / 550 kWh vault as "0.3 MW / 0.6
  // MWh" — understating one figure, overstating the other, and inventing a
  // unit the vault does not warrant. The shared helpers keep sub-MW sites in
  // kW and match what the page itself prints.
  const description = `${fmtPower(vault.spec.powerKw)} / ${fmtEnergy(vault.spec.energyKwh)} battery storage in ${vault.location}. Deposit RLUSD, earn a share of what it makes on the day-ahead market.`;

  return {
    title: vault.name,
    description,
    openGraph: {
      type: "website",
      siteName: "Megawatt",
      title: `${vault.name} — Megawatt`,
      description,
    },
  };
}

export default async function VaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vault = getVault(id);
  if (!vault) notFound();
  return <VaultDetail vault={vault} />;
}
