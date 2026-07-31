"use client";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { GrowthChart } from "@/components/GrowthChart";
import { useWallet, useToast } from "@/lib/wallet";
import { POSITIONS, portfolioMetrics, growthSeries } from "@/lib/portfolio";
import { getVault } from "@/lib/vaults";
import { fmtMoney, fmtCompact, fmtPct, fmtNum, bpsToPct } from "@/lib/format";
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
        <StatTile label="Total deposited" value={fmtCompact(m.totalDeposited, "USD")} sub={`${m.positionsCount} positions`} icon={<CoinsIcon size={18} />} />
        <StatTile label="Claimable yield" value={<span className="accent">{fmtMoney(totalClaimable, "EUR")}</span>} sub="Ready to claim" icon={<BoltIcon size={18} />} />
        <StatTile label="Total claimed" value={fmtMoney(m.totalClaimed, "EUR")} sub="Lifetime" icon={<ShieldIcon size={18} />} />
        <StatTile label="Avg APY" value={<span className="accent">{fmtPct(bpsToPct(m.avgApyBps))}</span>} sub="Deposit-weighted" icon={<TrendingUpIcon size={18} />} />
      </div>

      {/* Growth chart */}
      <div className="card">
        <div className="card-title">
          Portfolio value
          <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Principal + projected yield at current APY</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "12px 0 6px" }}>
          <div className="num" style={{ fontSize: 30, fontWeight: 690, letterSpacing: "-0.03em" }}>
            {fmtMoney(m.currentValue, "USD", 0)}
          </div>
          <div className="accent" style={{ fontSize: 13, fontWeight: 600 }}>
            +{fmtMoney(m.lifetimeYield, "EUR")} yield
          </div>
        </div>
        <GrowthChart data={growth} />
      </div>

      {/* Positions */}
      <div className="section-head">
        <h2 className="section-title">Your positions <span className="section-count">{POSITIONS.length}</span></h2>
        <button className="btn btn-ghost btn-sm" disabled={totalClaimable <= 0} onClick={() => notify(`Claimed ${fmtMoney(totalClaimable, "EUR")} across all positions`, "success")}>
          Claim all
        </button>
      </div>

      <div className="card" style={{ padding: "8px 20px" }}>
        <div className="drow-head pf-head caps" hidden={POSITIONS.length === 0}>
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
            <p className="empty-state-body">
              Deposit into a vault to start earning a share of what its batteries make on the day-ahead market. Your
              positions and claimable yield will show up here.
            </p>
            <Link className="btn btn-accent btn-sm" href="/">
              Browse vaults
            </Link>
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
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span className="vault-thumb" style={{ width: 38, height: 38, borderRadius: 10 }}>
                  {v.spec.hasSolar ? <SunIcon size={18} /> : <BatteryIcon size={18} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}><Flag code={v.flag} size={12} /> {v.location} · {fmtNum(p.shares)} {v.symbol}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }} className="num">{fmtMoney(p.deposited, "USD")}</div>
              <div style={{ textAlign: "right" }} className={`num ${p.claimable > 0 ? "accent" : "muted"}`}>{fmtMoney(p.claimable, v.currency)}</div>
              <div style={{ textAlign: "right" }} className="num">{fmtPct(bpsToPct(v.apyBps))}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", color: "var(--muted)" }}><ChevronRightIcon size={16} /></div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
