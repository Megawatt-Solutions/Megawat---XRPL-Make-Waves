"use client";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { GrowthChart } from "@/components/GrowthChart";
import { useWallet, useToast } from "@/lib/wallet";
import { POSITIONS, portfolioMetrics, growthSeries } from "@/lib/portfolio";
import { getVault } from "@/lib/vaults";
import { fmtMoney, fmtCompact, fmtPct, fmtNum, bpsToPct, plural } from "@/lib/format";
import {
  CoinsIcon, BoltIcon, ShieldIcon, TrendingUpIcon, ChevronRightIcon,
  SunIcon, BatteryIcon, WalletIcon, BriefcaseIcon,
} from "@/components/Icons";
import { Flag } from "@/components/Flag";


export default function PortfolioPage() {
  const { connected, connect } = useWallet();
  const { notify } = useToast();
  const m = portfolioMetrics();
  const growth = growthSeries();
  const totalClaimable = m.totalClaimable;

  if (!connected) {
    return (
      <main className="page">
        <div className="page-head">
          <h1 className="page-title">Portfolio</h1>
          <div className="page-sub">Track your deposits, yield, and positions.</div>
        </div>
        {/* This is where a curious visitor hits a wall, so it should say what
            connecting is *for* and never be a dead end — browsing vaults and
            playing Spreadcast both work with no wallet at all. */}
        <div className="card">
          <div className="empty-state">
            <WalletIcon size={26} />
            <div className="empty-state-title">Your positions live here</div>
            <p className="empty-state-body">
              Connect a wallet to see what you&apos;ve deposited, what each vault has earned, and claim yield as it
              accrues. Nothing is charged for connecting — it only reads your balances.
            </p>
            <div className="empty-state-actions">
              <button className="btn btn-accent btn-sm" onClick={connect}>
                Connect wallet
              </button>
              <Link className="btn btn-ghost btn-sm" href="/">
                Browse vaults instead
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Portfolio</h1>
        <div className="page-sub">Track your deposits, yield, and positions across all vaults.</div>
      </div>

      <div className="tile-grid">
        <StatTile label="Total deposited" value={fmtCompact(m.totalDeposited, "USD")} sub={plural(m.positionsCount, "position")} icon={<CoinsIcon size={18} />} />
        {/* The €0.00 is an honest zero and stays (see the Avg APY note below).
            "Ready to claim" is not a zero — it is an assertion about state, and
            nothing is ready. In the same row of four, Avg APY already admits
            emptiness with "No deposits yet" while this tile promised a claim
            was waiting. */}
        <StatTile
          label="Claimable yield"
          value={<span className="accent">{fmtMoney(totalClaimable, "EUR")}</span>}
          sub={totalClaimable > 0 ? "Ready to claim" : "Nothing to claim yet"}
          icon={<BoltIcon size={18} />}
        />
        <StatTile label="Total claimed" value={fmtMoney(m.totalClaimed, "EUR")} sub="Lifetime" icon={<ShieldIcon size={18} />} />
        {/* A deposit-weighted average with no deposits is undefined, not 0.0%.
            Same distinction as the marketplace's avg premium: the tiles either
            side are genuine zeros (nothing deposited, nothing claimable) and
            stay as they are. */}
        <StatTile
          label="Avg APY"
          value={m.positionsCount === 0
            ? <span className="muted">&mdash;</span>
            : <span className="accent">{fmtPct(bpsToPct(m.avgApyBps))}</span>}
          sub={m.positionsCount === 0 ? "No deposits yet" : "Deposit-weighted"}
          icon={<TrendingUpIcon size={18} />}
        />
      </div>

      {/* Growth chart — only once there is something to plot.
          growthSeries() returns 18 months of { principal: 0, interest: 0 }
          until deposits exist, and Chart.js given an all-zero dataset scales
          the axis symmetrically about zero: the y-axis read $1, $1, $1, $0,
          $0, $-0, $-0, $-1, $-1 — repeated labels and NEGATIVE money on a
          portfolio that has never held anything. On a financial product that
          does not read as "no data yet", it reads as broken. The empty state
          below already says what is missing and what to do, so this card
          simply waits its turn. */}
      {POSITIONS.length > 0 && (
      <div className="card">
        <div className="card-title">
          Portfolio value
          <span className="muted" style={{ fontSize: "0.75rem", fontWeight: 400 }}>Principal + projected yield at current APY</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "12px 0 6px" }}>
          <div className="num" style={{ fontSize: "1.875rem", fontWeight: 690, letterSpacing: "-0.03em" }}>
            {fmtMoney(m.currentValue, "USD", 0)}
          </div>
          <div className="accent" style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            +{fmtMoney(m.lifetimeYield, "EUR")} yield
          </div>
        </div>
        <GrowthChart data={growth} />
      </div>
      )}

      {/* Positions */}
      <div className="section-head">
        <h2 className="section-title">Your positions <span className="section-count">{POSITIONS.length}</span></h2>
        {/* Hidden when there are no positions, disabled when there are some but
            nothing has accrued. The distinction is deliberate: with positions
            on screen a disabled control tells you the action exists and will
            light up, which is worth the pixels. With an empty list it acts on
            nothing, and the empty state below already carries the two real
            actions — so it was a dead control beside a heading reading
            "Your positions 0". */}
        {POSITIONS.length > 0 && (
          <button className="btn btn-ghost btn-sm" disabled={totalClaimable <= 0} onClick={() => notify(`Claimed ${fmtMoney(totalClaimable, "EUR")} across all positions`, "success")}>
            Claim all
          </button>
        )}
      </div>

      <div className="card" style={{ padding: "8px 20px" }}>
        <div className="drow-head pf-head caps" aria-hidden="true" hidden={POSITIONS.length === 0}>
          <span>Vault</span>
          <span style={{ textAlign: "right" }}>Deposited</span>
          <span style={{ textAlign: "right" }}>Claimable</span>
          <span style={{ textAlign: "right" }}>APY</span>
          <span />
        </div>
        {POSITIONS.length === 0 && (
          <div className="empty-state">
            <BriefcaseIcon size={26} />
            <div className="empty-state-title">No positions yet</div>
            {/* This used to read "Deposit into a vault to start earning..." with
                a Browse vaults button. Nothing in the app takes a deposit today:
                both operational sites are showcases marked not investable, and
                all four onchain vaults are status coming_soon, which disables
                their deposit control. So the instruction sent someone to browse
                six vaults, find no way in, and conclude they had missed
                something.

                The timeline here is not invented — it is the same one the
                pipeline cards already state. And the second action is something
                that genuinely works today, rather than a second loop back. */}
            <p className="empty-state-body">
              No vault is open for deposits yet — the pipeline sites start fundraising next quarter. Their targets and
              capacity are on the vaults page, and Spreadcast is free to play in the meantime.
            </p>
            <div className="empty-state-actions">
              <Link className="btn btn-accent btn-sm" href="/">
                See the pipeline
              </Link>
              <Link className="btn btn-ghost btn-sm" href="/spreadcast">
                Play Spreadcast
              </Link>
            </div>
          </div>
        )}
        {POSITIONS.map((p) => {
          const v = getVault(p.vaultId);
          if (!v) return null;
          return (
            <Link
              key={p.vaultId}
              href={`/vault/${v.id}`}
              className="drow pf-row prow"
              // These rows are a list of links, not a table — see the note in
              // ai-development-guidelines.md on why role="row" would be worse.
              // The consequence is that no value in the row is associated with
              // the header above it, so the link's own name has to carry them:
              // without this it announces "BESS Ljubljana 01 SI Ljubljana,
              // Slovenia · 24,000 mwLJU01 $24,000.00 €812.44 12.2%" — four
              // bare figures in a row. Starts with the visible vault name so
              // the name still contains the label (WCAG 2.5.3).
              aria-label={
                `${v.name}, ${v.location}. ` +
                `Deposited ${fmtMoney(p.deposited, "USD")}, ` +
                `claimable ${fmtMoney(p.claimable, v.currency)}, ` +
                `APY ${fmtPct(bpsToPct(v.apyBps))}.`
              }
            >
              <div className="pf-c-id" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span className="vault-thumb" style={{ width: 38, height: 38, borderRadius: 10 }}>
                  {v.spec.hasSolar ? <SunIcon size={18} /> : <BatteryIcon size={18} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{v.name}</div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}><Flag code={v.flag} size={12} /> {v.location} · {fmtNum(p.shares)} {v.symbol}</div>
                </div>
              </div>
              {/* Below 700px the column headers are gone, so these carry their
                  own. Without them a phone showed two unlabelled money figures
                  stacked on the right — deposited and claimable are not
                  guessable from each other. APY was hidden outright; it now
                  sits on the row's third line rather than vanishing. */}
              <div className="pf-meta">
              <div className="num">
                <span className="row-lbl">Deposited</span>{fmtMoney(p.deposited, "USD")}
              </div>
              <div style={{ textAlign: "right" }} className={`num ${p.claimable > 0 ? "accent" : "muted"}`}>
                <span className="row-lbl">Claimable</span>{fmtMoney(p.claimable, v.currency)}
              </div>
              <div style={{ textAlign: "right" }} className="num">
                <span className="row-lbl">APY</span>{fmtPct(bpsToPct(v.apyBps))}
              </div>
              </div>
              <div className="pf-c-chev" style={{ display: "flex", justifyContent: "flex-end", color: "var(--muted)" }}><ChevronRightIcon size={16} /></div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
