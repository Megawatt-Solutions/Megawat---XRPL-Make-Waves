import type { Metadata } from "next";

import { StatTile } from "@/components/StatTile";
import { VaultCard } from "@/components/VaultCard";
import { VAULTS, dashboardMetrics, vaultsByStatus } from "@/lib/vaults";
import { fmtCompact, fmtNum, fmtPower, fmtEnergy, plural } from "@/lib/format";
import { ASSET_CURRENCY } from "@/lib/protocol";
import { CoinsIcon, ShieldIcon, LayersIcon, BoltIcon } from "@/components/Icons";
import { SpreadcastStrip } from "@/components/spreadcast/DailySpread";

export const metadata: Metadata = {
  // title.template applies to CHILD segments, not the segment that defines it,
  // so the root page does not inherit "%s — Megawatt" and needs the full
  // string. Without this it rendered as a bare "Vaults".
  title: "Vaults - Megawatt",
  description: "Six battery storage vaults across five countries - capacity, yield and current status.",
};

export default function DashboardPage() {
  const m = dashboardMetrics();
  const active = vaultsByStatus("active", "operational");
  const fundraising = vaultsByStatus("fundraising");
  const pipeline = vaultsByStatus("coming_soon");

  const countries = new Set(VAULTS.map((v) => v.country)).size;
  const totalMwh = VAULTS.reduce((s, v) => s + v.spec.energyKwh, 0) / 1000;

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Vaults</h1>
        <div className="page-sub">
          Invest in real battery energy storage systems, earn yield, and trade your position.
        </div>
      </div>

      {/* Cross-sell sits AFTER the page identifies itself — a promo should not
          be the first thing above a page's own title. */}
      <SpreadcastStrip />

      <div className="tile-grid">
        {/* This figure is the capex of the two sites Megawatt operates —
            lib/protocol.ts is explicit: "TVL = the operational systems (not
            tied to any chain)". No user has deposited anything. In this sector
            TVL is read as depositor money, so the sub-line has to say whose
            value it is; "2 active · 0 fundraising" read as "two vaults you can
            be in", which is the opposite of the truth. Wording follows the
            dashboard's own tile, which already framed this correctly. */}
        <StatTile
          label="Total Value Locked"
          value={fmtCompact(m.tvl, ASSET_CURRENCY)}
          sub={`${plural(m.activeCount, "operational site")} · none open for deposit yet`}
          icon={<CoinsIcon size={18} />}
        />
        <StatTile
          label="Replacement Fund"
          value={fmtCompact(m.replacementFund, ASSET_CURRENCY)}
          sub="Battery & gear refresh reserve"
          icon={<ShieldIcon size={18} />}
        />
        <StatTile
          label="Vaults"
          value={fmtNum(m.vaultCount)}
          sub={`Across ${countries} countries`}
          icon={<LayersIcon size={18} />}
        />
        <StatTile
          label="Total Capacity"
          value={fmtPower(m.totalMw * 1000)}
          sub={`${fmtEnergy(totalMwh * 1000)} storage`}
          icon={<BoltIcon size={18} />}
        />
      </div>

      <div className="section-head">
        <h2 className="section-title">
          <span className="dot pulse" style={{ background: "var(--accent)" }} />
          Active vaults <span className="section-count">{active.length}</span>
        </h2>
        {/* Derived, not asserted. Every card in this group already ends with
            "Showcase site · not investable", and the section above them said
            "Earning & operational" — true, and the half of the truth a visitor
            arriving on "Invest in real battery energy storage systems" is least
            likely to supply for themselves. Today all six sites here are
            showcase, so the section framing and the card footers disagreed in
            tone on the app's front door.
            Keyed on the contents rather than hardcoded: the moment one real
            active vault joins the group this goes back to the plain wording,
            which is the point — a genuinely investable vault must not inherit
            a caveat that belongs to its neighbours. */}
        <span className="muted" style={{ fontSize: "0.8125rem" }}>
          {active.every((v) => v.kind === "showcase")
            ? "Earning & operational · showcase, not open to deposits"
            : "Earning & operational"}
        </span>
      </div>
      <div className="vault-grid">
        {active.map((v) => (
          <VaultCard key={v.id} vault={v} />
        ))}
      </div>

      {fundraising.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <span className="dot" style={{ background: "var(--amber)" }} />
              Fundraising <span className="section-count">{fundraising.length}</span>
            </h2>
            <span className="muted" style={{ fontSize: "0.8125rem" }}>Open for deposits</span>
          </div>
          <div className="vault-grid">
            {fundraising.map((v) => (
              <VaultCard key={v.id} vault={v} />
            ))}
          </div>
        </>
      )}

      {pipeline.length > 0 && (
        <>
          <div className="section-head">
            <h2 className="section-title">
              <span className="dot" style={{ background: "var(--gray)" }} />
              Pipeline <span className="section-count">{pipeline.length}</span>
            </h2>
            <span className="muted" style={{ fontSize: "0.8125rem" }}>Committed · not yet open</span>
          </div>
          <div className="vault-grid">
            {pipeline.map((v) => (
              <VaultCard key={v.id} vault={v} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
