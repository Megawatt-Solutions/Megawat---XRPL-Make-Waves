import type { Metadata } from "next";

import { Odometer } from "@/components/Odometer";
import { BrandMark } from "@/components/BrandMark";
import { OverviewChart } from "@/components/OverviewChart";
import { VaultsOverview } from "@/components/VaultsOverview";
import { NetworkPanel } from "@/components/NetworkPanel";
import { Sparkline } from "@/components/Sparkline";
import { PROTOCOL, CAPACITY, tvlSeries, apySeries } from "@/lib/protocol";
import { fmtPct, bpsToPct, fmtMoney, fmtCompact } from "@/lib/format";
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
        <div className="page-sub">
          Institutional access to distributed battery storage — value locked, depositor yield, and deployed
          capacity across the vault network.
        </div>
      </div>

      {/* Cross-sell sits AFTER the page identifies itself — a promo should
          not be the first thing above a page's own title. */}
      <SpreadcastStrip />

      {/* 01 — Hero metrics */}
      <SectionHead index="01" name="Protocol metrics" meta="Updated per block" />
      <div className="panel">
        <Ticks />
        <div className="v2-metrics">
          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Total Value Locked</span>
              <Sparkline data={tvlSpark} width={64} height={20} fill={false} />
            </div>
            <div className="v2-metric-value num">{fmtMoney(PROTOCOL.tvl, "USD", 0)}</div>
            <div className="v2-metric-sub">
              2 operational sites · {fmtCompact(PROTOCOL.reserves, "USD")} replacement fund
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
              {CAPACITY.mwh.toFixed(1)} MWh storage across {CAPACITY.sites} sites
            </div>
          </div>

          <div className="v2-metric">
            <div className="v2-metric-top">
              <span className="caps">Cumulative Yield</span>
            </div>
            <div className="v2-metric-value">
              <Odometer startValue={PROTOCOL.cumulativeYield} ratePerSecond={0.05} />
            </div>
            <div className="v2-metric-sub">Depositor yield and protocol fees, realtime</div>
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
