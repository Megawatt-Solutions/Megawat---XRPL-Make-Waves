"use client";
import { useEffect, useState } from "react";
import type { Vault } from "@/lib/types";
import { getTelemetry } from "@/lib/telemetry";
import type { WeatherIcon, DeviceMetric, DeviceGroup } from "@/lib/telemetry";
import { fmtMoney, fmtCompact, fmtNum, fmtPct, fmtDate } from "@/lib/format";
import { EnergyFlow } from "./EnergyFlow";
import { SiteChart } from "./SiteChart";
import { ShieldIcon } from "./Icons";

function fmtKwh(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)} MWh` : `${fmtNum(v)} kWh`;
}

export function SiteMonitor({ vault }: { vault: Vault }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setT((x) => x + 1), 2200);
    return () => clearInterval(iv);
  }, []);
  const tel = getTelemetry(vault, t);

  return (
    <div>
      {/* Top summary cards */}
      <div className="site-summary">
        <div className="card site-card">
          <div className="site-card-title">{tel.production.label}</div>
          <div className="site-prod">
            <div><div className="site-prod-v num">{fmtNum(tel.production.todayKwh)} kWh</div><div className="caps">Today</div></div>
            <div><div className="site-prod-v num">{fmtKwh(tel.production.monthKwh)}</div><div className="caps">This Month</div></div>
            <div><div className="site-prod-v num">{fmtKwh(tel.production.yearKwh)}</div><div className="caps">This Year</div></div>
          </div>
        </div>

        <div className="card site-card">
          <div className="site-card-title">Weather</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, paddingTop: 6 }}>
            <WeatherGlyph icon={tel.weather.icon} />
            <div style={{ fontSize: "1.875rem", fontWeight: 680 }} className="num">{tel.weather.tempC}°C</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 600 }}>{tel.weather.condition}</div>
              <div className="muted" style={{ fontSize: "0.8125rem" }}>{tel.weather.location}</div>
            </div>
          </div>
        </div>

        <div className="card site-card">
          <div className="site-card-title">{vault.spec.hasSolar ? "Savings" : "Revenue"}</div>
          <div className="rows" style={{ marginTop: 2 }}>
            {/* Solar sites only. A non-solar site has no distinct primary
                metric, so this row fell back to todayValue — and rendered
                "Revenue €2,477" directly above "Today €2,477.00", inside a card
                whose title is already "Revenue". One number, two precisions,
                adjacent rows, on five of the six vaults. Self-sufficiency is a
                genuinely different measure, so the solar case keeps it. */}
            {vault.spec.hasSolar && (
              <div className="row"><span className="row-key">{tel.savings.primaryLabel}</span><span className="row-val accent num">{fmtPct(tel.savings.selfSufficiencyPct, 0)}</span></div>
            )}
            {/* Today carries the accent when it is the headline number. */}
            <div className="row"><span className="row-key">Today</span><span className={`row-val num${vault.spec.hasSolar ? "" : " accent"}`}>{fmtMoney(tel.savings.todayValue, tel.savings.currency, 0)}</span></div>
            <div className="row"><span className="row-key">This Month</span><span className="row-val num">{fmtCompact(tel.savings.monthValue, tel.savings.currency)}</span></div>
          </div>
        </div>
      </div>

      {/* Energy flow */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-title">
          Live Energy Flow
          <span className="live"><span className="dot pulse" style={{ background: "var(--accent)" }} /> live</span>
        </div>
        <div style={{ maxWidth: 760, margin: "4px auto 0" }}>
          <EnergyFlow live={tel.live} />
        </div>
      </div>

      {/* Chart + devices */}
      <div className="site-grid" style={{ marginTop: 18 }}>
        <SiteChart vault={vault} />
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {tel.devices.map((d) => <DeviceCard key={d.key} group={d} />)}
        </div>
      </div>
    </div>
  );
}

const KIND_COLOR: Record<DeviceMetric["kind"], string> = {
  import: "var(--amber)", export: "var(--accent)", self: "var(--blue)",
  charge: "var(--accent)", discharge: "var(--red)", soc: "var(--accent)", yield: "var(--amber)",
};

function DeviceCard({ group }: { group: DeviceGroup }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 620, fontSize: "0.875rem" }}>{group.label}</div>
        <span className="muted" style={{ fontSize: "0.75rem" }}>{group.deviceCount} {group.deviceCount === 1 ? "Device" : "Devices"}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
        {group.metrics.map((mm) => (
          <div key={mm.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot" style={{ background: KIND_COLOR[mm.kind] }} />
            <div>
              <div className="num" style={{ fontWeight: 680, fontSize: "1rem" }}>{fmtNum(mm.value, mm.unit === "%" ? 0 : 0)} <span style={{ fontSize: "0.6875rem", color: "var(--muted)", fontWeight: 500 }}>{mm.unit}</span></div>
              <div className="muted" style={{ fontSize: "0.6875rem" }}>{mm.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SiteOverview({ vault }: { vault: Vault }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 620, fontSize: "0.875rem", marginBottom: 8 }}>Site overview</div>
      <div className="rows">
        <div className="row"><span className="row-key">CapEx</span><span className="row-val num">{fmtCompact(vault.capex, vault.currency)}</span></div>
        <div className="row"><span className="row-key">Annual revenue</span><span className="row-val num accent">{vault.annualRevenueRange ? `${fmtCompact(vault.annualRevenueRange[0], vault.currency)}–${fmtCompact(vault.annualRevenueRange[1], vault.currency)}` : fmtCompact(vault.annualRevenue, vault.currency)}</span></div>
        {vault.commissioned && <div className="row"><span className="row-key">Commissioned</span><span className="row-val">{fmtDate(vault.commissioned)}</span></div>}
        <div className="row"><span className="row-key">Operator</span><span className="row-val">Megawatt</span></div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: 11, marginTop: 12, borderRadius: "var(--r-row)", background: "var(--blue-dim)", border: "1px solid color-mix(in srgb, var(--blue) 20%, transparent)" }}>
        <span style={{ color: "var(--blue)", flexShrink: 0 }}><ShieldIcon size={15} /></span>
        <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>Off-chain showcase of a live Megawatt site. Not an investable vault.</div>
      </div>
    </div>
  );
}

function WeatherGlyph({ icon }: { icon: WeatherIcon }) {
  // aria-hidden on every branch: these are pictograms beside the condition
  // written out in text. Announcing them would say the weather twice, and an
  // unnamed <svg> in the accessibility tree says nothing useful either way.
  const c = { width: 44, height: 44, "aria-hidden": true as const };
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon === "sun")
    return <svg {...c} viewBox="0 0 24 24" style={{ color: "var(--amber)" }}><g {...s}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></g></svg>;
  const cloud = <path d="M7 18h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.8 3.8 0 0 0 7 18Z" />;
  if (icon === "rain" || icon === "storm")
    return <svg {...c} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><g {...s}>{cloud}<path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2" /></g></svg>;
  if (icon === "snow")
    return <svg {...c} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><g {...s}>{cloud}<path d="M9 21h.01M13 21h.01M17 21h.01" /></g></svg>;
  // partly / cloud
  return (
    <svg {...c} viewBox="0 0 24 24" style={{ color: "var(--text-2)" }}>
      <g {...s}>
        <circle cx="8" cy="8" r="3" stroke="var(--amber)" />
        <path d="M8 2.5v1.5M3.5 8H2M4.6 4.6 3.6 3.6" stroke="var(--amber)" />
        <path d="M9 18h8a3.2 3.2 0 0 0 .3-6.4A4.6 4.6 0 0 0 9 11a3.5 3.5 0 0 0 0 7Z" />
      </g>
    </svg>
  );
}
