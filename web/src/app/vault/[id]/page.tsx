import type { Metadata, ResolvingMetadata } from "next";
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
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { id } = await params;
  const vault = getVault(id);
  if (!vault) return { title: "Vault not found" };

  // Declaring `openGraph` here REPLACES the parent's rather than merging into
  // it, so the first version of this silently dropped og:image from exactly
  // the URLs most likely to be shared — a vault link previewed with no card at
  // all, while every other route had one. Carry the inherited images through.
  const inheritedImages = (await parent).openGraph?.images ?? [];

  // fmtPower/fmtEnergy, not arithmetic here. Dividing by 1000 and rounding to
  // one decimal described Ljubljana's 350 kW / 550 kWh vault as "0.3 MW / 0.6
  // MWh" — understating one figure, overstating the other, and inventing a
  // unit the vault does not warrant. The shared helpers keep sub-MW sites in
  // kW and match what the page itself prints.
  // The second sentence depends on whether you can actually put money in.
  //
  // It used to be the deposit line for every vault, which meant the two
  // showcase sites carried "Deposit RLUSD, earn a share of what it makes" in
  // search results and link previews — while the page itself carries a pill
  // reading "Showcase site · not investable" and Site overview says deposits
  // happen in the on-chain vaults instead. The page was careful and the
  // sentence beside it contradicted it, in the copy that reaches people who
  // have not opened the page.
  //
  // Keyed on `kind`, and that is the right key here: whether a site is
  // investable is exactly what kind records. Not on `status` — a coming_soon
  // on-chain vault is still one you will be able to deposit into, and the page
  // says so with "Opens for fundraising next quarter".
  const spec = `${fmtPower(vault.spec.powerKw)} / ${fmtEnergy(vault.spec.energyKwh)} battery storage in ${vault.location}.`;
  const description =
    vault.kind === "showcase"
      ? `${spec} One of our operating sites, published so the performance behind Megawatt's numbers can be checked.`
      : `${spec} Deposit RLUSD, earn a share of what it makes on the day-ahead market.`;

  return {
    title: vault.name,
    description,
    openGraph: {
      type: "website",
      siteName: "Megawatt",
      title: `${vault.name} - Megawatt`,
      description,
      images: inheritedImages,
    },
  };
}

export default async function VaultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vault = getVault(id);
  if (!vault) notFound();
  return <VaultDetail vault={vault} />;
}
