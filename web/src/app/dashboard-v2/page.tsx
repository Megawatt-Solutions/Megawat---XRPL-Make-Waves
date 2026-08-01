import type { Metadata } from "next";

import { Odometer } from "@/components/Odometer";
import { BrandMark } from "@/components/BrandMark";
import { OverviewChart } from "@/components/OverviewChart";
import { VaultsOverview } from "@/components/VaultsOverview";
import { NetworkPanel } from "@/components/NetworkPanel";
import { Sparkline } from "@/components/Sparkline";
import { ASSET_CURRENCY, PROTOCOL, CAPACITY, tvlSeries, apySeries } from "@/lib/protocol";
import { CCY_SYMBOL, fmtPct, bpsToPct, fmtCompact, plural } from "@/lib/format";
import { SpreadcastStrip } from "@/components/spreadcast/DailySpread";

export const metadata: Metadata = {
  title: "Protocol overview",
  description: "Value locked, depositor yield and deployed capacity across the Megawatt vault network.",
};

function Ticks() {
  return (
    <>
      <span className="tick tl" />
      <span className="tick tr" />
      <span className="tick bl" />
      <span className="tick br" />
    </>
  );
}

function SectionHead({ index, name, meta }: { index: string; name: string; meta?: string }) {
  return (
    <div className="sec-head">
      <span className="sec-index">{index}</span>
      <span className="sec-name">{name}</span>
      <span className="sec-rule" />
      {meta && <span className="sec-meta">{meta}</span>}
    </div>
  );
}

export default function DashboardV2Page() {
  const tvl = tvlSeries("ALL");
  const tvlSpark = tvl.deployed.map((d, i) => d + tvl.reserves[i]);
  const apySpark = apySeries("ALL").values;

  return (
    <main className="page">
      {/* Status ribbon */}
      <div className="ribbon">
        <div className="ribbon-group">
          <span className="ribbon-item ribbon-live">
            <span className="dot pulse" style={{ background: "var(--accent)" }} />
            All systems operational
          </span>
          <span className="ribbon-item">XRPL — Mainnet</span>
        </div>
        <div className="ribbon-group ribbon-right">
          <span className="ribbon-item">Tokenization: XRPL MPT · RLUSD settlement</span>
          <span className="ribbon-item">Telemetry: 15-min intervals</span>
        </div>
      </div>

      <div className="page-head">
        <h1 className="page-title">Protocol overview</h1>
        {/* The subtitle enumerates the metrics below it, so it has to match
            them. It said "value locked, depositor yield" while the tiles show
            operational-site capex and site revenue — and once those subs were
            corrected, the page contradicted itself within 60px. The positioning
            claim in the first clause is untouched; only the list of what this
            page actually shows changed.

            NB "Depositor yield" in VaultsOverview's Yield Composition is a
            different and correct use: it names how revenue is SPLIT (74% to
            depositors), which is a statement about the model, not a claim that
            anyone has been paid. */}
        <div className="page-sub">
          Institutional access to distributed battery storage — operational value, site revenue, and deployed
          capacity across the vault network.
        </div>
      </div>

      {/* Cross-sell sits AFTER the page identifies itself — a promo should
          not be the first thing above a page's own title. */}
      <SpreadcastStrip />

      {/* 01 — Hero metrics */}
      {/* Not "Updated per block". Nothing in this section reads a block:
          lib/protocol.ts is headed "protocol-level overview mock data",
          every figure here is a static constant derived from VAULTS, and the
          only thing that moves is the yield odometer accruing client-side at
          a MODELLED rate (tvl x apy / seconds-per-year). Beside a "XRPL —
          Mainnet" ribbon, "updated per block" reads as a provenance claim,
          which is the same overstatement already corrected on this page for
          "value locked" and "depositor yield".

          It was also the odd one out: the other two section metas describe
          what the section contains rather than how often it changes. */}
      <SectionHead index="01" name="Protocol metrics" meta="Across the operating sites" />
      <div className="panel">
        <Ticks />
        <div className="v2-metrics">
          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Total Value Locked</span>
              <Sparkline data={tvlSpark} width={64} height={20} fill={false} />
            </div>
            {/* fmtCompact, not fmtMoney. This tile and the one on / carry the
                same label over the same number, one nav click apart, and read
                "$2,440,000" here against "$2.44M" there. Two presentations of
                one figure is the kind of thing that makes a reader wonder which
                is right — the worst possible reaction to a headline metric on a
                page about money.

                Compact wins because it is what the sibling route already shows,
                what this tile's OWN sub-line already uses for the replacement
                fund, and what a glanceable metric beside a sparkline wants.
                Exact figures live on the vault pages, where they are the point. */}
            <div className="v2-metric-value num">{fmtCompact(PROTOCOL.tvl, ASSET_CURRENCY)}</div>
            <div className="v2-metric-sub">
              2 operational sites · {fmtCompact(PROTOCOL.reserves, ASSET_CURRENCY)} replacement fund
            </div>
          </div>

          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Depositor APY</span>
              <Sparkline data={apySpark} width={64} height={20} fill={false} />
            </div>
            <div className="v2-metric-value num">
              {fmtPct(bpsToPct(PROTOCOL.stakingApyBps), 2)}
              <span className="v2-projected">{fmtPct(bpsToPct(PROTOCOL.projectedApyBps), 2)} proj</span>
            </div>
            <div className="v2-metric-sub accent">
              +{fmtPct(bpsToPct(PROTOCOL.pipelineApyDeltaBps), 2)} projected from pipeline
            </div>
          </div>

          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Total Capacity</span>
            </div>
            <div className="v2-metric-value num">
              {CAPACITY.mw.toFixed(1)} <span className="v2-metric-unit">MW</span>
            </div>
            <div className="v2-metric-sub">
              {CAPACITY.mwh.toFixed(1)} MWh storage across {plural(CAPACITY.sites, "site")}
            </div>
          </div>

          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Cumulative Yield</span>
            </div>
            <div className="v2-metric-value">
              {/* Odometer defaults to a "$" prefix. This figure is revenue earned by
                  the European sites, so it inherits the asset currency like every
                  other asset-side number on this page. */}
              <Odometer startValue={PROTOCOL.cumulativeYield} ratePerSecond={0.05} prefix={CCY_SYMBOL[ASSET_CURRENCY]} />
            </div>
            {/* Not depositor yield: there are no depositors. protocol.ts describes
                this figure as "Ljubljana ~2 yrs + Metlika ~11 months of revenue"
                — what the sites have earned, which is the honest and still
                impressive claim. */}
            <div className="v2-metric-sub">Revenue earned by the operating sites to date</div>
          </div>
        </div>
      </div>

      {/* 02 — Charts */}
      <SectionHead index="02" name="Performance" meta="TVL & depositor APY — historical" />
      <div className="v2-charts">
        <OverviewChart type="tvl" title="Total Value Locked" />
        <OverviewChart type="apy" title="Depositor APY" />
      </div>

      {/* 03 — Global network */}
      <SectionHead
        index="03"
        name="Global network"
        meta={`${CAPACITY.sites} sites · ${CAPACITY.mw.toFixed(1)} MW / ${CAPACITY.mwh.toFixed(1)} MWh`}
      />
      <div className="panel">
        <Ticks />
        <NetworkPanel />
      </div>

      {/* 04 — Vaults */}
      <SectionHead index="04" name="Vault allocation" meta="Deployed & pipeline capital" />
      <VaultsOverview />

      <footer className="v2-footer">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
          <BrandMark height={10} color="var(--muted)" />
          Megawatt Protocol — Tokenized Energy Infrastructure
        </span>
        <span>XRPL Mainnet · MPT receipt tokens · RLUSD settlement</span>
      </footer>
    </main>
  );
}
