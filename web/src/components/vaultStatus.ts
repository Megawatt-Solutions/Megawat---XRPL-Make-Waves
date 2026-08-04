// One status, one word — everywhere.
//
// This map existed twice, and the two copies had drifted. `coming_soon` read
// "Coming soon" on the vault cards (homepage, marketplace) and "Pipeline" in
// the dashboard table, while the globe tooltip printed a third spelling by
// running `status.replace("_", " ")` straight onto the raw enum value and
// getting lowercase "coming soon". Four vaults, three names, one status.
//
// "Coming soon" wins over "Pipeline" for a reason beyond just picking one.
// The dashboard table already groups its rows under a "Total Pipeline" header,
// so a badge reading "Pipeline" on every row inside that group restated the
// header and told you nothing. Worse, it flattened a real distinction: the
// pipeline group can hold both `coming_soon` and `fundraising` vaults, and
// those need to be told apart from each other, not labelled with the name of
// the bucket they share. The other three labels all describe the vault's own
// state; "Pipeline" was the only one naming a container.
//
// "Pipeline" remains correct where it actually is a container — the group
// header, and VaultDetail's phase heading. It is just not this vault's status.
//
// Typed against Vault["status"] rather than `string`: VaultsOverview's copy was
// a Record<string, …>, so a new status would have sailed past the compiler and
// crashed on `badge.cls` at runtime. This way it is a build error.
import type { Vault } from "@/lib/types";

export const STATUS_BADGE: Record<Vault["status"], { cls: string; label: string }> = {
  active: { cls: "badge-active", label: "Active" },
  fundraising: { cls: "badge-fundraising", label: "Fundraising" },
  operational: { cls: "badge-operational", label: "Operational" },
  coming_soon: { cls: "badge-soon", label: "Coming soon" },
};

/** Status as a word, for places that want the label without the chip. */
export function statusLabel(status: Vault["status"]): string {
  return STATUS_BADGE[status].label;
}
