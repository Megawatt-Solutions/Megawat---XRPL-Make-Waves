"use client";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Vault } from "@/lib/types";
import {
  fmtMoney, fmtCompact, fmtPct, fmtNum, bpsToPct, fmtPower, fmtEnergy,
  fmtDuration, fmtAgo, fmtDate, fmtAddress,
} from "@/lib/format";
import { raiseProgress, grossYieldBps } from "@/lib/vaults";
import { simulate, nextDistributionSec } from "@/lib/bess";
import { POSITIONS } from "@/lib/portfolio";
import { useWallet, useToast } from "@/lib/wallet";
import { explorerAccount } from "@/lib/xrpl";
import { Donut } from "./Donut";
import { SiteMonitor } from "./SiteMonitor";
import {
  ArrowLeftIcon, ClockIcon, BoltIcon, SunIcon, CubeIcon, VerifiedIcon,
  ExternalLinkIcon, ShieldIcon, CheckIcon, XIcon, ChevronDownIcon, WalletIcon,
} from "./Icons";
import { Flag } from "./Flag";

// Operational reads green like every other live signal — see NetworkPanel.
const STATUS_DOT: Record<Vault["status"], string> = {
  active: "var(--accent)",
  fundraising: "var(--amber)",
  operational: "var(--accent)",
  coming_soon: "var(--gray)",
};

export function VaultDetail({ vault }: { vault: Vault }) {
  const { profile, connected, connect } = useWallet();
  const { notify } = useToast();
  const [t, setT] = useState(0);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showPerf, setShowPerf] = useState(false);

  const isShowcase = vault.kind === "showcase";
  const isActive = vault.status === "active";
  const isFundraising = vault.status === "fundraising";
  const isComing = vault.status === "coming_soon";
  const hasTelemetry = isActive || isShowcase;

  // Live simulation (client-only motion; SSR renders t=0 deterministically).
  useEffect(() => {
    if (!hasTelemetry) return;
    const iv = setInterval(() => setT((x) => x + 1), 2200);
    return () => clearInterval(iv);
  }, [hasTelemetry]);
  const snap = simulate(vault, t);

  // Position + balances from mock data; goes live when vaults tokenize on XRPL.
  const position = POSITIONS.find((p) => p.vaultId === vault.id);
  const claimable = position?.claimable ?? 0;
  const deposited = position?.deposited ?? 0;
  const liveRaised = vault.raised;
  const liveTarget = vault.capex;
  const liveCurrency = vault.currency;
  const sharePct = position?.sharePct ?? 0;
  const progress = raiseProgress(vault);
  const rlusdBalance = profile?.rlusdBalance ?? 0;

  const onClaim = () => {
    if (!connected) return connect();
    if (claimable <= 0) return;
    posthog.capture("yield_claimed", {
      vault_id: vault.id,
      vault_name: vault.name,
      amount: claimable,
      currency: vault.currency,
    });
    notify(`Claimed ${fmtMoney(claimable, vault.currency)} yield`, "success");
  };

  return (
    <main className="page">
      <Link href="/" className="back-link">
        <ArrowLeftIcon size={15} /> Dashboard
      </Link>

      <div className="surface">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 690, letterSpacing: "-0.025em" }}>{vault.name}</h1>
              <span className="dot" style={{ background: STATUS_DOT[vault.status], boxShadow: `0 0 8px ${STATUS_DOT[vault.status]}` }} />
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>
              <Flag code={vault.flag} size={13} /> {vault.location} · {fmtEnergy(vault.spec.energyKwh)} · {fmtPct(bpsToPct(vault.apyBps))} {isShowcase ? "gross" : "APY"}
            </div>
          </div>

          {isShowcase ? (
            <span className="wallet-pill" style={{ cursor: "default" }}>
              <span className="dot" style={{ background: "var(--blue)" }} /> Operated by Megawatt
            </span>
          ) : vault.addresses ? (
            <a className="wallet-pill" href={explorerAccount(vault.addresses.vault)} target="_blank" rel="noreferrer">
              <span className="num">{fmtAddress(vault.addresses.vault)}</span>
              <ExternalLinkIcon size={13} />
            </a>
          ) : null}
        </div>

        {/* Tiles */}
        <div className="detail-tiles" style={{ marginTop: 22 }}>
          <Tile
            label={isShowcase ? "Gross yield" : "APY"}
            value={<span className="accent">{fmtPct(bpsToPct(vault.apyBps))}</span>}
            sub={isShowcase ? "On capex / yr" : "Per annum"}
            icon={<BoltIcon size={17} />}
          />
          {hasTelemetry ? (
            <Tile
              label={snap.mode}
              value={`${snap.socPct.toFixed(1)}%`}
              sub="State of charge"
              icon={<BoltIcon size={17} />}
            />
          ) : (
            <Tile
              label="Raised"
              value={`${Math.round(progress * 100)}%`}
              sub={`${fmtCompact(liveRaised, liveCurrency)} / ${fmtCompact(liveTarget, liveCurrency)}`}
            />
          )}
          <div className="tile">
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", minWidth: 0 }}>
              <div>
                <div className="caps">Capacity</div>
                <div className="tile-value sm num">{fmtEnergy(vault.spec.energyKwh)}</div>
                <div className="tile-sub">{fmtPower(vault.spec.powerKw)} · installed</div>
              </div>
              <div>
                <div className="caps">{hasTelemetry ? "Battery health" : "Chemistry"}</div>
                <div className="tile-value sm num">
                  {hasTelemetry ? `${snap.healthPct.toFixed(1)}%` : vault.spec.chemistry}
                </div>
                <div className="tile-sub">{hasTelemetry ? "State of health" : vault.spec.hasSolar ? "+ solar" : "battery"}</div>
              </div>
            </div>
          </div>
          <div className="brand-panel">
            <span style={{ position: "relative", zIndex: 1 }}><CubeIcon size={54} /></span>
          </div>
        </div>

        {/* Body */}
        <div className="detail-layout">
          <div className="detail-main">
            {/* Left-top */}
            {isShowcase ? (
              <RevenueCard vault={vault} snap={snap} />
            ) : isActive ? (
              <ClaimCard
                vault={vault}
                claimable={claimable}
                distributed={vault.yieldDistributed ?? 0}
                claimed={vault.yieldClaimed ?? 0}
                currency={liveCurrency}
                onClaim={onClaim}
              />
            ) : (
              <FundraisingCard
                progress={progress}
                deposited={deposited}
                raised={liveRaised}
                target={liveTarget}
                currency={liveCurrency}
                disabled={isComing}
                onDeposit={() => {
                  if (connected) {
                    posthog.capture("deposit_initiated", { vault_id: vault.id, vault_name: vault.name, vault_status: vault.status });
                    setShowDeposit(true);
                  } else {
                    connect();
                  }
                }}
              />
            )}

            {/* Right-top */}
            <YieldBreakdownCard vault={vault} updatedAgo={snap.updatedAgoSec} />

            {/* Left-bottom & right-bottom */}
            {hasTelemetry ? (
              <>
                <StateOfChargeCard vault={vault} snap={snap} />
                <LatestMetricsCard vault={vault} snap={snap} />
              </>
            ) : (
              <>
                <UseOfFundsCard vault={vault} />
                <SiteDetailsCard vault={vault} />
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="detail-side">
            {isShowcase ? (
              <SiteOverviewCard vault={vault} />
            ) : (
              <PositionCard
                vault={vault}
                claimable={claimable}
                deposited={deposited}
                sharePct={sharePct}
                raised={liveRaised}
                rlusdBalance={rlusdBalance}
                showClaim={isActive}
                depositDisabled={isComing}
                connected={connected}
                onDeposit={() => {
                  if (connected) {
                    posthog.capture("deposit_initiated", { vault_id: vault.id, vault_name: vault.name, vault_status: vault.status });
                    setShowDeposit(true);
                  } else {
                    connect();
                  }
                }}
                onClaim={onClaim}
              />
            )}
          </div>
        </div>
      </div>

      {hasTelemetry && (
        <div className="perf-section">
          <button className="perf-toggle" onClick={() => setShowPerf((v) => !v)}>
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <BoltIcon size={16} /> Live performance &amp; energy flow
            </span>
            <span className="perf-chevron" style={{ transform: showPerf ? "rotate(180deg)" : "none" }}>
              <ChevronDownIcon size={18} />
            </span>
          </button>
          {showPerf && (
            <div className="surface perf-panel">
              <SiteMonitor vault={vault} />
            </div>
          )}
        </div>
      )}

      {showDeposit && (
        <DepositModal
          vault={vault}
          rlusdBalance={rlusdBalance}
          remaining={Math.max(0, liveTarget - liveRaised)}
          kycOk={(profile?.kycLevel ?? 0) >= 1}
          onClose={() => setShowDeposit(false)}
          onMockDone={(amt) => {
            notify(`Deposited ${fmtMoney(amt, "USD")} RLUSD — received ${fmtNum(amt)} ${vault.symbol}`, "success");
            setShowDeposit(false);
          }}
        />
      )}
    </main>
  );
}

// ─── Tiles ────────────────────────────────────────────────────
function Tile({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="tile">
      {icon && <span className="tile-icon">{icon}</span>}
      <div className="caps">{label}</div>
      <div className="tile-value num">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

// ─── Left-top: yield / claim (active) ─────────────────────────
function ClaimCard({ vault, claimable, distributed, claimed, currency, onClaim }: {
  vault: Vault; claimable: number; distributed: number; claimed: number; currency: Vault["currency"]; onClaim: () => void;
}) {
  return (
    <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column" }}>
      <div className="caps" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <VerifiedIcon size={13} style={{ color: "var(--accent)" }} /> Yield Distributed
        <span className="dot pulse" style={{ background: "var(--accent)" }} />
      </div>
      <div className="num card-hero-num">
        {fmtMoney(distributed, currency)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
        Total claimed: {fmtMoney(claimed, currency)}
      </div>
      <button className="btn btn-accent btn-block" style={{ marginTop: 18 }} onClick={onClaim} disabled={claimable <= 0}>
        {claimable > 0 ? `Claim ${fmtMoney(claimable, currency)}` : "No yield to claim"}
      </button>
      <div className="divider" />
      <div className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        <ClockIcon size={14} /> Next distribution in{" "}
        <strong style={{ color: "var(--text)" }}>{fmtDuration(nextDistributionSec(vault))}</strong>
      </div>
    </div>
  );
}

// ─── Left-top: Revenue (showcase) ─────────────────────────────
function RevenueCard({ vault, snap }: { vault: Vault; snap: ReturnType<typeof simulate> }) {
  return (
    <div className="card">
      <div className="card-title">
        Revenue <span className="live"><span className="dot pulse" style={{ background: "var(--accent)" }} /> live</span>
      </div>
      <div className="num card-hero-num">
        {fmtMoney(snap.grossYtd, vault.currency, 0)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>Gross revenue · year to date</div>
      <div className="divider" />
      <div className="rows">
        <div className="row"><span className="row-key">Net revenue (YTD)</span><span className="row-val accent num">{fmtMoney(snap.netYtd, vault.currency, 0)}</span></div>
        <div className="row"><span className="row-key">Annual run-rate</span><span className="row-val num">{fmtCompact(vault.annualRevenue, vault.currency)}</span></div>
        <div className="row"><span className="row-key">Current price</span><span className="row-val num">{fmtMoney(snap.pricePerMwh, vault.currency)}/MWh</span></div>
      </div>
    </div>
  );
}

// ─── Left-top: Fundraising ────────────────────────────────────
function FundraisingCard({ progress, deposited, raised, target, currency, disabled, onDeposit }: {
  progress: number; deposited: number; raised: number; target: number; currency: Vault["currency"]; disabled?: boolean; onDeposit: () => void;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="card-title">Fundraising <span className="badge badge-fundraising">{Math.round(progress * 100)}% funded</span></div>
      <div className="num card-hero-num">
        {fmtCompact(raised, currency)}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>raised of {fmtCompact(target, currency)} target</div>
      <div className="progress" style={{ marginTop: 16 }}>
        <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="divider" />
      <div className="rows">
        <div className="row"><span className="row-key">Your deposit</span><span className="row-val num">{fmtMoney(deposited, "USD")}</span></div>
        <div className="row"><span className="row-key">Remaining</span><span className="row-val num">{fmtCompact(Math.max(0, target - raised), currency)}</span></div>
      </div>
      <button className="btn btn-accent btn-block" style={{ marginTop: 16 }} onClick={onDeposit} disabled={disabled}>
        {disabled ? "Fundraising opens soon" : "Deposit into Vault"}
      </button>
    </div>
  );
}

// ─── Yield breakdown ──────────────────────────────────────────
function YieldBreakdownCard({ vault, updatedAgo }: { vault: Vault; updatedAgo: number }) {
  const s = vault.split;
  const items = [
    { label: vault.kind === "showcase" ? "Net yield" : "Depositor APY", bps: s.depositorBps, color: "var(--accent)", desc: "Yield paid out to vault depositors" },
    { label: "Protocol Fee", bps: s.protocolFeeBps, color: "var(--amber)", desc: "Operations & protocol treasury" },
    { label: "Sinking Fund", bps: s.sinkingFundBps, color: "var(--blue)", desc: "Reserved to refresh batteries & gear after ~10 yrs of degradation" },
    { label: "Reserve", bps: s.reserveBps, color: "var(--gray)", desc: "Operational buffer for downtime events" },
  ];
  const total = grossYieldBps(vault);
  return (
    <div className="card">
      <div className="card-title">
        Yield Breakdown
        <span className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, fontWeight: 400 }}>
          <ClockIcon size={12} /> Updated {fmtAgo(updatedAgo)}
        </span>
      </div>
      <div className="segbar" style={{ marginTop: 16 }}>
        {items.map((it) => (
          <span key={it.label} style={{ width: `${(it.bps / total) * 100}%`, background: it.color }}>
            {it.bps / total > 0.12 ? fmtPct(bpsToPct(it.bps)) : ""}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        {items.map((it) => (
          <div className="legend-row" key={it.label}>
            <div className="legend-left">
              <span className="dot" style={{ background: it.color, marginTop: 5 }} />
              <div>
                <div className="legend-name">{it.label}</div>
                <div className="legend-desc">{it.desc}</div>
              </div>
            </div>
            <span className="num" style={{ fontWeight: 650 }}>{fmtPct(bpsToPct(it.bps))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── State of charge (active/showcase) ────────────────────────
function StateOfChargeCard({ vault, snap }: { vault: Vault; snap: ReturnType<typeof simulate> }) {
  const charging = snap.mode === "charging";
  return (
    <div className="card">
      <div className="card-title">
        State of Charge
        <span className={`badge ${charging ? "badge-active" : "badge-fundraising"}`}>
          {charging ? "↑ Charging" : snap.mode === "idle" ? "Idle" : "↓ Discharging"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 16, alignItems: "center" }}>
        <div className="battery">
          <div className="battery-fill" style={{ height: `calc(${snap.socPct}% - 0px)` }} />
          <div className="battery-pct num">{snap.socPct.toFixed(1)}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>
          <Mini label="MWh charged" value={fmtNum(snap.chargedMwh, 2)} />
          <Mini label="MWh discharged" value={fmtNum(snap.dischargedMwh, 2)} />
          <Mini label="Health" value={`${snap.healthPct.toFixed(1)}%`} />
        </div>
      </div>
      <div className="divider" />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div className="num" style={{ fontWeight: 650, fontSize: 15 }}>{(snap.roundTripEff * 100).toFixed(1)}%</div>
          <div className="muted" style={{ fontSize: 12 }}>Round-trip efficiency</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontWeight: 650, fontSize: 15 }}>{fmtNum(snap.cycles)}</div>
          <div className="muted" style={{ fontSize: 12 }}>Lifetime cycles</div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span className="num" style={{ fontWeight: 650, fontSize: 15 }}>{value}</span>
    </div>
  );
}

// ─── Latest BESS metrics ──────────────────────────────────────
function LatestMetricsCard({ vault, snap }: { vault: Vault; snap: ReturnType<typeof simulate> }) {
  return (
    <div className="card">
      <div className="card-title">Latest BESS Metrics</div>
      <div className="rows" style={{ marginTop: 6 }}>
        <Row k="Gross Revenue (YTD)" v={fmtMoney(snap.grossYtd, vault.currency)} />
        <Row k="Net Revenue (YTD)" v={fmtMoney(snap.netYtd, vault.currency)} accent />
        <Row k="Energy Charged" v={`${fmtNum(snap.chargedMwh, 2)} MWh`} />
        <Row k="Energy Discharged" v={`${fmtNum(snap.dischargedMwh, 2)} MWh`} />
        <Row k="Activation Events" v={fmtNum(snap.activations)} />
        <Row k="Data Source" v={vault.kind === "onchain" ? "XRPL Mainnet" : "On-site telemetry"} />
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="row">
      <span className="row-key">{k}</span>
      <span className={`row-val num ${accent ? "accent" : ""}`}>{v}</span>
    </div>
  );
}

// ─── Use of funds (fundraising) ───────────────────────────────
function UseOfFundsCard({ vault }: { vault: Vault }) {
  const items = [
    { label: "Battery system & PCS", pct: 62, color: "var(--accent)" },
    { label: "Installation & EPC", pct: 18, color: "var(--blue)" },
    { label: "Grid connection", pct: 12, color: "var(--amber)" },
    { label: "Contingency", pct: 8, color: "var(--gray)" },
  ];
  return (
    <div className="card">
      <div className="card-title">Use of Funds</div>
      <div className="segbar" style={{ marginTop: 16 }}>
        {items.map((it) => (
          <span key={it.label} style={{ width: `${it.pct}%`, background: it.color }}>{it.pct >= 12 ? `${it.pct}%` : ""}</span>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        {items.map((it) => (
          <div className="row" key={it.label}>
            <span className="legend-left" style={{ alignItems: "center" }}>
              <span className="dot" style={{ background: it.color }} /> <span style={{ marginLeft: 9 }}>{it.label}</span>
            </span>
            <span className="num row-val">{fmtCompact((vault.capex * it.pct) / 100, vault.currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Site details (fundraising) ───────────────────────────────
function SiteDetailsCard({ vault }: { vault: Vault }) {
  return (
    <div className="card">
      <div className="card-title">Project Details</div>
      <div className="rows" style={{ marginTop: 6 }}>
        <Row k="Power / Energy" v={`${fmtPower(vault.spec.powerKw)} / ${fmtEnergy(vault.spec.energyKwh)}`} />
        <Row k="Chemistry" v={vault.spec.chemistry} />
        <Row k="Projected annual revenue" v={fmtCompact(vault.annualRevenue, vault.currency)} />
        <Row k="Depositor APY" v={fmtPct(bpsToPct(vault.apyBps))} accent />
        <Row k="Receipt token" v={`${vault.symbol} · XRPL MPT`} />
        <Row k="Network" v="XRPL · Mainnet" />
      </div>
    </div>
  );
}

// ─── Site overview (showcase) ─────────────────────────────────
function SiteOverviewCard({ vault }: { vault: Vault }) {
  return (
    <div className="card">
      <div className="card-title">Site Overview</div>
      <div className="rows" style={{ marginTop: 6 }}>
        <Row k="CapEx" v={fmtCompact(vault.capex, vault.currency)} />
        <Row k="Annual revenue" v={vault.annualRevenueRange ? `${fmtCompact(vault.annualRevenueRange[0], vault.currency)}–${fmtCompact(vault.annualRevenueRange[1], vault.currency)}` : fmtCompact(vault.annualRevenue, vault.currency)} accent />
        <Row k="Power / Energy" v={`${fmtPower(vault.spec.powerKw)} / ${fmtEnergy(vault.spec.energyKwh)}`} />
        <Row k="Chemistry" v={vault.spec.chemistry + (vault.spec.hasSolar ? ` + ${vault.spec.solarKwp} kWp solar` : "")} />
        {vault.commissioned && <Row k="Commissioned" v={fmtDate(vault.commissioned)} />}
        <Row k="Operator" v="Megawatt" />
      </div>
      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <div style={{ display: "flex", gap: 9, padding: 13, borderRadius: 12, background: "var(--blue-dim)", border: "1px solid color-mix(in srgb, var(--blue) 20%, transparent)" }}>
          <span style={{ color: "var(--blue)", flexShrink: 0 }}><ShieldIcon size={17} /></span>
          <div style={{ fontSize: 12, color: "var(--text-2)" }}>
            Off-chain showcase — one of our operational sites, shown for transparency. Not an investable vault.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Your position (onchain) ──────────────────────────────────
function PositionCard(props: {
  vault: Vault; claimable: number; deposited: number; sharePct: number; raised: number;
  rlusdBalance: number; showClaim: boolean; depositDisabled?: boolean; connected: boolean;
  onDeposit: () => void; onClaim: () => void;
}) {
  const { vault, claimable, deposited, sharePct, raised, rlusdBalance, showClaim, depositDisabled, connected, onDeposit, onClaim } = props;
  const others = Math.max(0, raised - deposited);
  const othersPct = Math.max(0, 100 - sharePct);

  if (!connected) {
    return (
      <div className="card">
        <div className="card-title">Your position</div>
        <div className="empty-state">
          <WalletIcon size={26} />
          <p className="empty-state-body" style={{ marginTop: 2 }}>
            Connect a wallet to deposit into this vault and track what it earns. Everything on this page is readable
            without one.
          </p>
          <button className="btn btn-accent btn-sm" onClick={onDeposit}>
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">Your Position</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "16px 0 6px" }}>
        <Donut
          size={112}
          segments={[
            { value: Math.max(sharePct, 0.001), color: "var(--accent)" },
            { value: othersPct, color: "rgba(255,255,255,0.08)" },
          ]}
          centerLabel={`${sharePct.toFixed(0)}%`}
          centerSub="Your share"
        />
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>
          <LegendItem color="var(--accent)" name="You" value={fmtMoney(deposited, "USD")} pct={sharePct} />
          <LegendItem color="rgba(255,255,255,0.18)" name="Others" value={fmtMoney(others, "USD")} pct={othersPct} />
        </div>
      </div>
      <div className="divider" />
      <div className="rows">
        <Row k="Your RLUSD" v={fmtMoney(rlusdBalance, "USD")} />
        <Row k="Your Deposit" v={fmtMoney(deposited, "USD")} />
        <Row k="Your Share" v={fmtPct(sharePct, 2)} />
        <Row k="Claimable Yield" v={fmtMoney(claimable, "USD")} accent />
      </div>
      <div style={{ marginTop: "auto", paddingTop: 18, display: "grid", gap: 10 }}>
        <button className="btn btn-ghost btn-block" onClick={onDeposit} disabled={depositDisabled}>
          {depositDisabled ? "Fundraising opens soon" : "Deposit into Vault"}
        </button>
        {showClaim && (
          <button className="btn btn-accent btn-block" onClick={onClaim} disabled={claimable <= 0}>
            {claimable > 0 ? `Claim ${fmtMoney(claimable, "USD")}` : "Nothing to claim"}
          </button>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, name, value, pct }: { color: string; name: string; value: string; pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span className="dot" style={{ background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{name} · <span className="num">{value}</span></div>
        <div className="muted num" style={{ fontSize: 12 }}>{pct.toFixed(2)}%</div>
      </div>
    </div>
  );
}

// ─── Deposit modal ────────────────────────────────────────────
// Mock flow while vault tokenization is being built on XRPL: the real
// version settles RLUSD via Xaman-signed payments and issues MPT shares.
function DepositModal({ vault, rlusdBalance, remaining, kycOk, onClose, onMockDone }: {
  vault: Vault;
  rlusdBalance: number;
  remaining: number;
  kycOk: boolean;
  onClose: () => void;
  onMockDone: (amt: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const amt = parseFloat(amount) || 0;
  const tooMuch = amt > rlusdBalance;
  const overCap = amt > remaining;
  const valid = amt > 0 && !tooMuch && !overCap && kycOk;
  const maxAmt = Math.min(rlusdBalance, remaining);

  const submit = () => {
    posthog.capture("deposit_completed", {
      vault_id: vault.id,
      vault_name: vault.name,
      amount_rlusd: amt,
      shares_received: amt,
      vault_symbol: vault.symbol,
    });
    onMockDone(amt);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Deposit into {vault.shortName}</span>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}><XIcon size={18} /></button>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <div className="field-label">
            <span>Amount</span>
            <span className="muted num">Balance: {fmtMoney(rlusdBalance, "USD")} RLUSD</span>
          </div>
          <div className="input-suffix">
            <input className="input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ paddingRight: 92 }} />
            <span className="suffix">
              RLUSD{" "}
              <button onClick={() => setAmount(String(maxAmt))} style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "none", padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: 4 }}>MAX</button>
            </span>
          </div>
        </div>

        <div className="rows" style={{ marginBottom: 4 }}>
          <Row k="You receive" v={`${fmtNum(amt)} ${vault.symbol}`} />
          <Row k="Vault remaining" v={fmtMoney(remaining, "USD")} />
          <Row k="Receipt token" v="XRPL MPT share · tradeable" />
          <Row k="Projected APY" v={fmtPct(bpsToPct(vault.apyBps))} accent />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: kycOk ? "var(--accent)" : "var(--amber)", margin: "10px 0 4px" }}>
          {kycOk ? <CheckIcon size={14} /> : <ShieldIcon size={14} />}
          {kycOk ? "KYC verified — eligible to deposit" : "KYC verification required to deposit"}
        </div>

        <div className="modal-footer" style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ flex: 1 }} disabled={!valid} onClick={submit}>
            {tooMuch ? "Insufficient RLUSD" : overCap ? "Exceeds vault capacity" : "Confirm deposit"}
          </button>
        </div>
      </div>
    </div>
  );
}
