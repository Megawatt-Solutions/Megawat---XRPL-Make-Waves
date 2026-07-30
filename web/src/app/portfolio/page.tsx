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
  SunIcon, BatteryIcon, WalletIcon,
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
          <div className="page-title">Portfolio</div>
          <div className="page-sub">Track your deposits, yield, and positions.</div>
        </div>
        <div className="card empty">
          <div style={{ display: "grid", placeItems: "center", gap: 14 }}>
            <span style={{ color: "var(--muted)" }}><WalletIcon size={34} /></span>
            <div>
              <div className="empty-title" style={{ fontSize: 16, fontWeight: 600, color: "var(--text-2)" }}>Connect your wallet</div>
              <div style={{ fontSize: 13.5, marginTop: 4 }}>Connect to view your deposits and claimable yield.</div>
            </div>
            <button className="btn btn-accent" style={{ width: 200 }} onClick={connect}>Connect Wallet</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div className="page-title">Portfolio</div>
        <div className="page-sub">Track your deposits, yield, and positions across all vaults.</div>
      </div>

      <div className="tile-grid">
        <StatTile label="Total Deposited" value={fmtCompact(m.totalDeposited, "USD")} sub={`${m.positionsCount} positions`} icon={<CoinsIcon size={18} />} />
        <StatTile label="Claimable Yield" value={<span className="accent">{fmtMoney(totalClaimable, "EUR")}</span>} sub="Ready to claim" icon={<BoltIcon size={18} />} />
        <StatTile label="Total Claimed" value={fmtMoney(m.totalClaimed, "EUR")} sub="Lifetime" icon={<ShieldIcon size={18} />} />
        <StatTile label="Avg APY" value={<span className="accent">{fmtPct(bpsToPct(m.avgApyBps))}</span>} sub="Deposit-weighted" icon={<TrendingUpIcon size={18} />} />
      </div>

      {/* Growth chart */}
      <div className="card">
        <div className="card-title">
          Portfolio Value
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
        <div className="section-title">Your Positions <span className="section-count">{POSITIONS.length}</span></div>
        <button className="btn btn-ghost btn-sm" disabled={totalClaimable <= 0} onClick={() => notify(`Claimed ${fmtMoney(totalClaimable, "EUR")} across all positions`, "success")}>
          Claim all
        </button>
      </div>

      <div className="card" style={{ padding: "8px 20px" }}>
        <div className="drow-head pf-head caps">
          <span>Vault</span>
          <span style={{ textAlign: "right" }}>Deposited</span>
          <span style={{ textAlign: "right" }}>Claimable</span>
          <span style={{ textAlign: "right" }}>APY</span>
          <span />
        </div>
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
