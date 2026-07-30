"use client";
import { useState } from "react";
import Link from "next/link";
import { allocation, vaultGroups } from "@/lib/protocol";
import type { VaultRow } from "@/lib/protocol";
import { fmtCompact, fmtPct, fmtNum, bpsToPct } from "@/lib/format";
import { SunIcon, BatteryIcon, ChevronRightIcon } from "./Icons";
import { Flag } from "./Flag";

const COLS = "2.3fr 1.3fr 0.8fr 1fr 1fr";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  active: { cls: "badge-active", label: "Active" },
  operational: { cls: "badge-operational", label: "Operational" },
  fundraising: { cls: "badge-fundraising", label: "Fundraising" },
  coming_soon: { cls: "badge-soon", label: "Pipeline" },
};

export function VaultsOverview() {
  const [tab, setTab] = useState<"vaults" | "yield">("vaults");
  const alloc = allocation();
  const groups = vaultGroups();
  const deployedTotal = alloc.deployed.reduce((s, x) => s + x.value, 0);
  const pipelineTotal = alloc.pipeline.reduce((s, x) => s + x.value, 0);
  const totalCount = groups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="surface">
      {/* Allocation bar */}
      <div className="alloc-heads">
        <span style={{ flexGrow: deployedTotal }}>Total Deployed</span>
        <span style={{ flexGrow: pipelineTotal }}>Total Pipeline</span>
      </div>
      <div className="alloc-bar">
        <div className="alloc-group" style={{ flexGrow: deployedTotal }}>
          {alloc.deployed.map((s) => (
            <span key={s.key} title={s.label} style={{ flexGrow: Math.max(s.value, 1), background: s.color }} />
          ))}
        </div>
        <div className="alloc-group" style={{ flexGrow: pipelineTotal }}>
          {alloc.pipeline.map((s) => (
            <span key={s.key} title={s.label} style={{ flexGrow: Math.max(s.value, 1), background: s.color }} />
          ))}
        </div>
      </div>

      {/* Legend + total */}
      <div className="alloc-legend">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
          {[...alloc.deployed, ...alloc.pipeline].map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
              <span className="dot" style={{ background: s.color }} />
              <span className="dim">{s.label}</span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtCompact(s.value, "USD")}</span>
            </span>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          Total: <span className="num" style={{ color: "var(--text)", fontWeight: 650 }}>{fmtCompact(alloc.total, "USD")}</span>
          <span className="section-count" style={{ marginLeft: 8 }}>{totalCount} vaults</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-tabs">
        <button className={`v2-tab ${tab === "vaults" ? "active" : ""}`} onClick={() => setTab("vaults")}>Vault Details</button>
        <button className={`v2-tab ${tab === "yield" ? "active" : ""}`} onClick={() => setTab("yield")}>Yield Composition</button>
      </div>

      {tab === "vaults" ? (
        <div className="v2-table">
          <div className="v2-row v2-head caps" style={{ gridTemplateColumns: COLS }}>
            <span>Vaults</span>
            <span>Amount (Utilization)</span>
            <span>APY</span>
            <span>Contribution</span>
            <span>Status</span>
          </div>
          {groups.map((g) => (
            <div key={g.group}>
              <div className="v2-row v2-group" style={{ gridTemplateColumns: COLS }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 11 }}>
                  {g.group === "deployed" ? "Total Deployed" : "Total Pipeline"} <span className="muted">{g.count} vaults</span>
                </span>
                <span className="num">{fmtCompact(g.total, "USD")}</span>
                <span className="num">{fmtPct(bpsToPct(g.blendedApyBps))}</span>
                <span className="num accent">+{fmtPct(bpsToPct(g.rows.reduce((s, r) => s + r.contributionBps, 0)))}</span>
                <span />
              </div>
              {g.rows.map((r) => (
                <VaultDetailRow key={r.vault.id} row={r} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <YieldComposition />
      )}
    </div>
  );
}

function VaultDetailRow({ row }: { row: VaultRow }) {
  const v = row.vault;
  const badge = STATUS_BADGE[v.status];
  return (
    <Link href={`/vault/${v.id}`} className="v2-row v2-vault" style={{ gridTemplateColumns: COLS }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span className="vault-thumb" style={{ width: 30, height: 30 }}>
          {v.spec.hasSolar ? <SunIcon size={15} /> : <BatteryIcon size={15} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14, display: "block" }}>{v.name}</span>
          <span className="muted" style={{ fontSize: 12 }}><Flag code={v.flag} size={12} /> {v.location}</span>
        </span>
      </span>
      <span className="num">
        {fmtCompact(row.amount, v.currency)}
        <span className="muted" style={{ fontSize: 12 }}> ({row.utilizationPct.toFixed(0)}%)</span>
      </span>
      <span className="num">{fmtPct(bpsToPct(row.apyBps))}</span>
      <span className="num accent">{row.contributionBps > 0 ? `+${fmtPct(bpsToPct(row.contributionBps))}` : "—"}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <ChevronRightIcon size={15} style={{ color: "var(--muted)" }} />
      </span>
    </Link>
  );
}

function YieldComposition() {
  const parts = [
    { label: "Depositor yield", pct: 74, color: "var(--accent)" },
    { label: "Protocol fees", pct: 14, color: "var(--amber)" },
    { label: "Sinking fund", pct: 8, color: "var(--blue)" },
    { label: "Reserve buffer", pct: 4, color: "var(--gray)" },
  ];
  return (
    <div style={{ paddingTop: 8 }}>
      <div className="segbar" style={{ marginBottom: 16 }}>
        {parts.map((p) => (
          <span key={p.label} style={{ flexGrow: p.pct, background: p.color }}>{p.pct >= 10 ? `${p.pct}%` : ""}</span>
        ))}
      </div>
      <div className="rows">
        {parts.map((p) => (
          <div className="row" key={p.label}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span className="dot" style={{ background: p.color }} /> {p.label}
            </span>
            <span className="num row-val">{fmtPct(p.pct, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
