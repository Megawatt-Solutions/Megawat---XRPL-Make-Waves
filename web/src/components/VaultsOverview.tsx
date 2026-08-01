"use client";
import { useState } from "react";
import Link from "next/link";
import { ASSET_CURRENCY, allocation, vaultGroups, yieldComposition } from "@/lib/protocol";
import type { VaultRow } from "@/lib/protocol";
import { fmtCompact, fmtPct, fmtNum, bpsToPct, plural } from "@/lib/format";
import { SunIcon, BatteryIcon, ChevronRightIcon } from "./Icons";
import { Flag } from "./Flag";
import { apyBpsIsGross } from "@/lib/vaults";
import { STATUS_BADGE } from "./vaultStatus";

const COLS = "2.3fr 1.3fr 0.8fr 1fr 1fr";

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
      {/* aria-hidden because the legend directly below states every segment's
          label AND value as text. Without it a screen reader met four empty
          spans whose only content was a `title` — four disconnected phrases,
          no numbers, no indication they described one bar — and then heard the
          same four categories again, properly, from the legend.

          Segments are filtered to value > 0. `Math.max(s.value, 1)` plus the
          stylesheet's `min-width: 2px` meant a category worth $0 still painted
          a 2px stripe: "Active vaults" and "Fundraising" are both $0 today and
          both drew one. A proportional bar that shows a slice for nothing is
          not a styling detail, it misstates the data. The max() guard stays so
          a genuinely tiny non-zero slice is still visible. */}
      <div className="alloc-bar" aria-hidden="true">
        <div className="alloc-group" style={{ flexGrow: deployedTotal }}>
          {alloc.deployed.filter((s) => s.value > 0).map((s) => (
            <span key={s.key} title={s.label} style={{ flexGrow: Math.max(s.value, 1), background: s.color }} />
          ))}
        </div>
        <div className="alloc-group" style={{ flexGrow: pipelineTotal }}>
          {alloc.pipeline.filter((s) => s.value > 0).map((s) => (
            <span key={s.key} title={s.label} style={{ flexGrow: Math.max(s.value, 1), background: s.color }} />
          ))}
        </div>
      </div>

      {/* Legend + total */}
      <div className="alloc-legend">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
          {[...alloc.deployed, ...alloc.pipeline].map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.8125rem" }}>
              <span className="dot" style={{ background: s.color }} />
              <span className="dim">{s.label}</span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtCompact(s.value, ASSET_CURRENCY)}</span>
            </span>
          ))}
        </div>
        <div className="muted" style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
          Total: <span className="num" style={{ color: "var(--text)", fontWeight: 650 }}>{fmtCompact(alloc.total, ASSET_CURRENCY)}</span>
          <span className="section-count" style={{ marginLeft: 8 }}>{plural(totalCount, "vault")}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-tabs" role="group" aria-label="Overview view">
        <button className={`v2-tab ${tab === "vaults" ? "active" : ""}`} aria-pressed={tab === "vaults"} onClick={() => setTab("vaults")}>Vault Details</button>
        <button className={`v2-tab ${tab === "yield" ? "active" : ""}`} aria-pressed={tab === "yield"} onClick={() => setTab("yield")}>Yield Composition</button>
      </div>

      {tab === "vaults" ? (
        <div className="v2-table">
          <div className="v2-row v2-head caps" style={{ gridTemplateColumns: COLS }}>
            <span>Vaults</span>
            <span>Amount (Utilization)</span>
            {/* Was "APY" for every row, but the two deployed rows are showcase
                sites whose apyBps is a gross yield on capex — vaults.ts labels
                it exactly that ("gross yield on capex (showcase headline)") and
                VaultCard already renders it under "Gross yield" rather than
                "APY". Only this table flattened the two into one word, and it
                picked the word that means the more favourable, more regulated
                thing. "Yield" is true of every row; the rows that need the
                narrower reading carry it themselves. */}
            <span>Yield</span>
            <span>Contribution</span>
            <span>Status</span>
          </div>
          {groups.map((g) => {
            // Derived, not hardcoded: today the deployed group happens to be
            // both showcase vaults, so its blended figure is a blend of gross
            // yields and is marked as such. Add an investable vault to that
            // group and the blend stops being purely gross, the marker
            // disappears on its own, and the per-row markers still carry the
            // distinction. A mixed blend is genuinely a mixed number — the one
            // thing that must never happen is calling an all-gross blend "APY".
            const allGross = g.rows.length > 0 && g.rows.every((r) => apyBpsIsGross(r.vault));
            return (
            <div key={g.group}>
              <div className="v2-row v2-group" style={{ gridTemplateColumns: COLS }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "0.6875rem" }}>
                  {g.group === "deployed" ? "Total Deployed" : "Total Pipeline"} <span className="muted">{plural(g.count, "vault")}</span>
                </span>
                <span className="num">{fmtCompact(g.total, ASSET_CURRENCY)}</span>
                <span className="num">
                  {fmtPct(bpsToPct(g.blendedApyBps))}
                  {allGross && <span className="muted" style={{ fontSize: "0.6875rem" }}> gross</span>}
                </span>
                <span className="num accent">+{fmtPct(bpsToPct(g.rows.reduce((s, r) => s + r.contributionBps, 0)))}</span>
                <span />
              </div>
              {g.rows.map((r) => (
                <VaultDetailRow key={r.vault.id} row={r} />
              ))}
            </div>
            );
          })}
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
  const isShowcase = v.kind === "showcase";
  return (
    <Link href={`/vault/${v.id}`} className="v2-row v2-vault" style={{ gridTemplateColumns: COLS }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span className="vault-thumb" style={{ width: 30, height: 30 }}>
          {v.spec.hasSolar ? <SunIcon size={15} /> : <BatteryIcon size={15} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "0.875rem", display: "block" }}>{v.name}</span>
          <span className="muted" style={{ fontSize: "0.75rem" }}><Flag code={v.flag} size={12} /> {v.location}</span>
          {/* Third surface, same statement. VaultCard and VaultDetail both say a
              showcase vault cannot be bought; this table listed the same two
              vaults with an amount, a yield, a contribution and an
              "Operational" badge, and said nothing. Of the three places a
              person meets these vaults it was the one that most looks like a
              portfolio of things you own. */}
          {isShowcase && (
            <span className="v2-avail">
              <span className="dot" style={{ background: "var(--blue)" }} />
              {/* The name column is ~170px at the table's 540px scroll width, so
                  this ~193px string wraps. Left alone it breaks at the last
                  space and strands "investable" on line two, which reads for an
                  instant as the opposite of what it says. Breaking after the
                  separator instead keeps the operative phrase whole. */}
              <span>Showcase site · <span style={{ whiteSpace: "nowrap" }}>not investable</span></span>
            </span>
          )}
        </span>
      </span>
      <span className="num">
        {fmtCompact(row.amount, v.currency)}
        <span className="muted" style={{ fontSize: "0.75rem" }}> ({row.utilizationPct.toFixed(0)}%)</span>
      </span>
      <span className="num">
        {fmtPct(bpsToPct(row.apyBps))}
        {apyBpsIsGross(v) && <span className="muted" style={{ fontSize: "0.75rem" }}> gross</span>}
      </span>
      <span className="num accent">{row.contributionBps > 0 ? `+${fmtPct(bpsToPct(row.contributionBps))}` : "—"}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <ChevronRightIcon size={15} style={{ color: "var(--muted)" }} />
      </span>
    </Link>
  );
}

function YieldComposition() {
  // Was four hardcoded percentages that matched no vault in the data. Every
  // other figure on this page derives from VAULTS; this one was drawn by hand,
  // and it understated the sinking fund by a third and the reserve buffer by
  // about 40%. See yieldComposition() for the Belgrade caveat.
  const { slices, grossBps, siteCount } = yieldComposition();
  return (
    <div style={{ paddingTop: 8 }}>
      <div className="segbar" style={{ marginBottom: 16 }}>
        {slices.map((p) => (
          <span key={p.key} style={{ flexGrow: p.pct, background: p.color }}>
            {p.pct >= 10 ? `${Math.round(p.pct)}%` : ""}
          </span>
        ))}
      </div>
      <div className="rows">
        {slices.map((p) => (
          <div className="row" key={p.key}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
              <span className="dot" style={{ background: p.color }} /> {p.label}
            </span>
            {/* Both the share and the yield it represents. A composition chart
                that only gives percentages never says what they are a
                percentage OF, so "74% to depositors" was unanchored — 74% of
                an unstated number. */}
            <span className="num row-val">
              {fmtPct(p.pct, 1)}
              <span className="muted" style={{ fontSize: "0.75rem", marginLeft: 8 }}>
                {fmtPct(bpsToPct(Math.round(p.bps)), 2)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: "0.75rem", marginTop: 12 }}>
        Shares of a {fmtPct(bpsToPct(Math.round(grossBps)), 2)} blended gross yield, weighted by capex across{" "}
        {plural(siteCount, "site")}.
      </div>
    </div>
  );
}
