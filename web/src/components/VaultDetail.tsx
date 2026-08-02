"use client";
import posthog from "posthog-js";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Vault } from "@/lib/types";
import { useDialog, scrimDismiss } from "./useDialog";
import {
  CCY_SYMBOL, fmtMoney, fmtCompact, fmtPct, fmtNum, bpsToPct, fmtPower, fmtEnergy,
  fmtDuration, fmtDate, fmtAddress,
} from "@/lib/format";
import { raiseProgress, grossYieldBps, apyBpsIsGross } from "@/lib/vaults";
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
import { VaultSpreadLine } from "./spreadcast/DailySpread";

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
  // Whether the headline figure is a gross yield or a depositor APY is a
  // property of the DATA, not of `kind` — see apyBpsIsGross().
  const isGrossHeadline = apyBpsIsGross(vault);
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
              <h1 style={{ fontSize: "1.5rem", fontWeight: 690, letterSpacing: "-0.025em" }}>{vault.name}</h1>
              <span className="dot" style={{ background: STATUS_DOT[vault.status], boxShadow: `0 0 8px ${STATUS_DOT[vault.status]}` }} />
            </div>
            <div className="muted" style={{ fontSize: "0.875rem", marginTop: 3 }}>
              <Flag code={vault.flag} size={13} /> {vault.location} · {fmtEnergy(vault.spec.energyKwh)} · {fmtPct(bpsToPct(vault.apyBps))} {isGrossHeadline ? "gross" : "APY"}
            </div>
          </div>

          {isShowcase ? (
            /* This used to read "Operated by Megawatt", which says who runs the
               site but not the thing a visitor most needs to know: that none of
               the numbers below are buyable. That fact lived only in the last
               card of the sidebar — which on mobile stacks below everything, so
               it sat 3.7 phone screens under the 12.2% headline it qualifies.

               A financial page must not put its most important qualifier last.
               The operator line is still in Site overview; what belongs up here
               beside the yield is what the yield does NOT entitle you to.

               A `title` used to hang here carrying the reason — "A live site we
               operate, published for transparency. Not open for deposits." It
               is gone. A title is reachable by hovering a mouse and by nothing
               else: no touch, no keyboard (this is a span), and unreliably by
               screen readers — the same objection globals.css already records
               against `title` twice. It was also a duplicate: Site overview
               says it at more length and better ("Off-chain showcase — one of
               our operational sites, published so the performance behind
               Megawatt's numbers can be checked"). A tooltip that repeats
               visible copy buys mouse users nothing and suggests to everyone
               else that something is being withheld. */
            <span className="wallet-pill" style={{ cursor: "default" }}>
              <span className="dot" style={{ background: "var(--blue)" }} /> Showcase site · not investable
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
          {/* label and sub key on the SAME predicate. They did not: the label
                moved to apyBpsIsGross() when the kind-based guess was found
                wrong for Leipzig — on-chain, but its apyBps really is a gross
                yield — and this sub was left on `kind`. Measured:

                  Ljubljana  GROSS YIELD  12.2%  "On capex / yr"
                  Leipzig    GROSS YIELD  12.4%  "Per annum"

                Two tiles reading GROSS YIELD, disagreeing about what the
                number is a yield ON. The sub is the part carrying the
                denominator, and on capex per year is exactly what makes a
                figure gross rather than a depositor APY — so the one vault
                that most needed the qualifier was the one missing it.

                Same fix as the label, applied to the other half of the tile. */}
          <Tile
            label={isGrossHeadline ? "Gross yield" : "APY"}
            value={<span className="accent">{fmtPct(bpsToPct(vault.apyBps))}</span>}
            sub={isGrossHeadline ? "On capex / yr" : "Per annum"}
            icon={<BoltIcon size={17} />}
          />
          {hasTelemetry ? (
            <Tile
              label={modeLabel(snap.mode)}
              value={`${snap.socPct.toFixed(1)}%`}
              sub="State of charge"
              icon={<BoltIcon size={17} />}
            />
          ) : (
            // A pipeline site has not failed to raise — it has not started.
            // "Raised 0%" contradicts the Pipeline card directly below it.
            <Tile
              label={isComing ? "Target raise" : "Raised"}
              value={isComing ? fmtCompact(liveTarget, liveCurrency) : `${Math.round(progress * 100)}%`}
              sub={
                isComing
                  ? "Opens next quarter"
                  : `${fmtCompact(liveRaised, liveCurrency)} / ${fmtCompact(liveTarget, liveCurrency)}`
              }
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
            <YieldBreakdownCard vault={vault} />

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
          {/* The app's other disclosure — the archive day row — already does
              this, comment and all: aria-expanded always, aria-controls only
              while the panel exists, because the panel is rendered lazily and a
              dangling reference promises the accessibility tree a relationship
              it cannot follow. This one, the only other disclosure in the app,
              had none of it. A screen reader was told "button, Live performance
              & energy flow" with no indication it opens anything, or that it
              was already open.

              Sighted users were unaffected — the chevron rotates — which is
              exactly why it lasted. The state sweep also reached this panel by
              other means, so nothing here was hiding behind the missing
              attribute; it was simply a promise the accessibility tree was
              never told about. */}
          <button
            type="button"
            className="perf-toggle"
            aria-expanded={showPerf}
            aria-controls={showPerf ? `perf-panel-${vault.id}` : undefined}
            onClick={() => setShowPerf((v) => !v)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <BoltIcon size={16} /> Live performance &amp; energy flow
            </span>
            <span className="perf-chevron" style={{ transform: showPerf ? "rotate(180deg)" : "none" }}>
              <ChevronDownIcon size={18} />
            </span>
          </button>
          {showPerf && (
            <div className="surface perf-panel" id={`perf-panel-${vault.id}`}>
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
/** One mapping for MarketMode, because there were two.
 *
 *  The hero tile rendered `label={snap.mode}` — the stored enum straight to
 *  screen, showing CHARGING via .caps — while the State of charge card 370
 *  lines below formatted the same field as "↑ Charging" / "Idle" /
 *  "↓ Discharging". Same value, same page, two spellings, and the arrow that
 *  tells you which way the energy is flowing appeared on only one of them.
 *
 *  The arrows are the point: charge direction is the single most useful thing
 *  about this field, so the tile is the surface that most needed them.
 */
function modeLabel(mode: string): string {
  if (mode === "charging") return "↑ Charging";
  if (mode === "idle") return "Idle";
  return "↓ Discharging";
}

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
      <div className="muted" style={{ fontSize: "0.8125rem", marginTop: 4 }}>
        Total claimed: {fmtMoney(claimed, currency)}
      </div>
      <button className="btn btn-accent btn-block" style={{ marginTop: 18 }} onClick={onClaim} disabled={claimable <= 0}>
        {claimable > 0 ? `Claim ${fmtMoney(claimable, currency)}` : "No yield to claim"}
      </button>
      <div className="divider" />
      <div className="muted" style={{ fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
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
      <div className="muted" style={{ fontSize: "0.8125rem", marginTop: 3 }}>Gross revenue · year to date</div>
      {/* The thesis, in one row: this revenue comes from the day-ahead spread,
          which is the exact number Spreadcast asks you to predict. */}
      <VaultSpreadLine />
      <div className="divider" />
      <div className="rows">
        <div className="row"><span className="row-key">Net revenue (YTD)</span><span className="row-val accent num">{fmtMoney(snap.netYtd, vault.currency, 0)}</span></div>
        <div className="row"><span className="row-key">Annual run-rate</span><span className="row-val num">{fmtCompact(vault.annualRevenue, vault.currency)}</span></div>
        {/* "196.76 €/MWh" three rows above this one, and "€138.30/MWh" here —
            the same quantity written two ways inside 200px. The app writes this
            unit as a suffix everywhere else: the Spreadcast bands, the results
            table, the daily-spread line directly above. fmtMoney puts the
            symbol in front of the number, which is right for a sum of money and
            wrong for a price per unit. */}
        <div className="row"><span className="row-key">Current price</span><span className="row-val num">{fmtNum(snap.pricePerMwh, 2)} {CCY_SYMBOL[vault.currency]}/MWh</span></div>
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
      {/* A pipeline site is not a failed raise. "0% funded" over an empty
          progress bar frames a plan as an emptiness; state the size of the
          project instead, and give the visitor somewhere live to go rather
          than a disabled button as the only outcome. */}
      {disabled ? (
        <>
          <div className="card-title">
            Pipeline <span className="badge badge-soon">Not yet open</span>
          </div>
          <div className="num card-hero-num">{fmtCompact(target, currency)}</div>
          <div className="muted" style={{ fontSize: "0.8125rem", marginTop: 3 }}>
            target raise · opens for fundraising next quarter
          </div>
          <div className="divider" />
          <div className="rows">
            <div className="row">
              <span className="row-key">Status</span>
              <span className="row-val">Site secured, permitting under way</span>
            </div>
            <div className="row">
              <span className="row-key">Deposits</span>
              <span className="row-val muted">Not open yet</span>
            </div>
          </div>
          <Link className="btn btn-ghost btn-block" href="/vault/bess-ljubljana-01" style={{ marginTop: 16 }}>
            See a vault that&apos;s already running
          </Link>
        </>
      ) : (
        <>
          <div className="card-title">
            Fundraising <span className="badge badge-fundraising">{Math.round(progress * 100)}% funded</span>
          </div>
          <div className="num card-hero-num">{fmtCompact(raised, currency)}</div>
          <div className="muted" style={{ fontSize: "0.8125rem", marginTop: 3 }}>
            raised of {fmtCompact(target, currency)} target
          </div>
          <div className="progress" style={{ marginTop: 16 }}>
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="divider" />
          <div className="rows">
            <div className="row"><span className="row-key">Your deposit</span><span className="row-val num">{fmtMoney(deposited, "USD")}</span></div>
            <div className="row"><span className="row-key">Remaining</span><span className="row-val num">{fmtCompact(Math.max(0, target - raised), currency)}</span></div>
          </div>
          <button className="btn btn-accent btn-block" style={{ marginTop: 16 }} onClick={onDeposit}>
            Deposit into Vault
          </button>
        </>
      )}
    </div>
  );
}

// ─── Yield breakdown ──────────────────────────────────────────
function YieldBreakdownCard({ vault }: { vault: Vault }) {
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
        Yield breakdown
        <span className="muted" style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 5, fontWeight: 400 }}>
          {/* Not "Updated Ns ago". Nothing in this card updates: the four
              figures are grossYieldBps(vault) and its fixed split, static
              constants in vaults.ts. Measured over 30s — the body and the bar
              widths are byte-identical throughout.

              The number was manufactured. bess.ts computes it as
              (t % 6) * 2 + 1, so sampled every 3s it reads
              1, 5, 7, 11, 1, 3, 7, 9, 11, 3 — it counts DOWN as often as up.
              A real "N seconds ago" only rises until a refresh resets it, so
              this was not merely decorative, it was self-contradicting.

              dashboard-v2 already made exactly this correction for exactly this
              reason: its "Updated per block" became "Across the operating
              sites", with a note that a freshness claim beside a Mainnet ribbon
              reads as provenance. Same fix here — say what the card contains.
              The four values are shares of gross yield and sum to it (8.5 + 1.6
              + 1.4 + 0.7 = 12.2%, Ljubljana's gross). */}
          Share of gross yield
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
        State of charge
        <span className={`badge ${charging ? "badge-active" : "badge-fundraising"}`}>
          {modeLabel(snap.mode)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 16, alignItems: "center" }}>
        <div className="battery">
          <div className="battery-fill" style={{ height: `calc(${snap.socPct}% - 0px)` }} />
          <div className="battery-pct num">{snap.socPct.toFixed(1)}%</div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>
          {/* Unit in the value, not the label. The third row of this same card
              is "Health / 98.9%" — unit in the value — so the card disagreed
              with itself, and the metrics card two columns right writes the
              identical numbers as "Energy charged / 361.40 MWh". Three
              spellings, one screen. */}
          <Mini label="Charged" value={`${fmtNum(snap.chargedMwh, 2)} MWh`} />
          <Mini label="Discharged" value={`${fmtNum(snap.dischargedMwh, 2)} MWh`} />
          <Mini label="Health" value={`${snap.healthPct.toFixed(1)}%`} />
        </div>
      </div>
      <div className="divider" />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <div className="num" style={{ fontWeight: 650, fontSize: "0.9375rem" }}>{(snap.roundTripEff * 100).toFixed(1)}%</div>
          <div className="muted" style={{ fontSize: "0.75rem" }}>Round-trip efficiency</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontWeight: 650, fontSize: "0.9375rem" }}>{fmtNum(snap.cycles)}</div>
          <div className="muted" style={{ fontSize: "0.75rem" }}>Lifetime cycles</div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span className="muted" style={{ fontSize: "0.8125rem" }}>{label}</span>
      <span className="num" style={{ fontWeight: 650, fontSize: "0.9375rem" }}>{value}</span>
    </div>
  );
}

// ─── Latest BESS metrics ──────────────────────────────────────
function LatestMetricsCard({ vault, snap }: { vault: Vault; snap: ReturnType<typeof simulate> }) {
  return (
    <div className="card">
      <div className="card-title">Latest BESS metrics</div>
      <div className="rows" style={{ marginTop: 6 }}>
        {/* Same two values the Revenue card shows, and at 1440 both cards are
            on screen together — it read "€15,620" there against "€15,620.00"
            here. The zero decimals were added at those call sites and not at
            these; cents on a €15,620 YTD figure carry no information and only
            invite "which of these is right?". */}
        <Row k="Gross revenue (YTD)" v={fmtMoney(snap.grossYtd, vault.currency, 0)} />
        <Row k="Net revenue (YTD)" v={fmtMoney(snap.netYtd, vault.currency, 0)} accent />
        <Row k="Energy charged" v={`${fmtNum(snap.chargedMwh, 2)} MWh`} />
        <Row k="Energy discharged" v={`${fmtNum(snap.dischargedMwh, 2)} MWh`} />
        <Row k="Activation events" v={fmtNum(snap.activations)} />
        {/* Telemetry either way. This row used to read "XRPL Mainnet" whenever
            kind === "onchain", but look at what the card above it contains:
            energy charged, energy discharged and activation events. A ledger
            does not measure MWh or count battery cycles — every value here
            comes from simulate(vault, t) seeded by vault.metrics, which is the
            site's own instrumentation, on-chain vault or not.

            `kind` says where the receipt token lives, not where the numbers
            were measured. That is the same conflation the kind-decides-yield-
            label rule already exists for: a property of the DATA keyed on a
            property of the wrapper.

            Dormant today — the card needs isActive || isShowcase and no vault
            is active — but it would have started asserting the wrong
            provenance on the day the first vault tokenizes, which is the one
            day everybody looks. Where settlement happens is stated in the
            footer and the deposit rows; it does not belong in a measurement
            source. */}
        <Row k="Data source" v="On-site telemetry" />
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
      <div className="card-title">Use of funds</div>
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
  const isGrossHeadline = apyBpsIsGross(vault);
  return (
    <div className="card">
      <div className="card-title">Project details</div>
      <div className="rows" style={{ marginTop: 6 }}>
        <Row k="Power / Energy" v={`${fmtPower(vault.spec.powerKw)} / ${fmtEnergy(vault.spec.energyKwh)}`} />
        <Row k="Chemistry" v={vault.spec.chemistry} />
        <Row k="Projected annual revenue" v={fmtCompact(vault.annualRevenue, vault.currency)} />
        {/* Renders apyBps, which for five of six vaults is the GROSS yield —
            it sits directly under "Projected annual revenue" and is exactly
            that revenue over capex. Labelled "Depositor APY" it contradicted
            the Yield breakdown card on the same page, which reads
            split.depositorBps: Leipzig showed "Depositor APY 12.4%" here and
            "Depositor APY 8.8%" there. The label now says which number this
            is; deciding which number BELONGS here is a founder call. */}
        <Row k={isGrossHeadline ? "Gross yield on capex" : "Depositor APY"} v={fmtPct(bpsToPct(vault.apyBps))} accent />
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
      <div className="card-title">Site overview</div>
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
          <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
            {/* The header pill now carries "not investable" so it is read
                before the numbers rather than after them. This keeps the
                explanation — why the site is here at all — without repeating
                the headline verdict twice on one page. */}
            Off-chain showcase — one of our operational sites, published so the performance behind Megawatt&apos;s
            numbers can be checked. Operated by Megawatt; deposits happen in the on-chain vaults.
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
  // Nothing has been deposited by anyone, so there is no distribution to draw.
  // othersPct is `100 - sharePct`, which returns a confident 100 when the
  // denominator is zero, and the card rendered a full grey ring labelled
  // "100.00%" against a legend reading "Others · $0.00" — a party holding all
  // of nothing. Today that is not an edge case but the ONLY state this card
  // has: POSITIONS is empty and every vault open to deposits has raised: 0.
  const noDistribution = raised <= 0;

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
      <div className="card-title">Your position</div>
      {noDistribution ? (
        <div className="empty-state">
          <WalletIcon size={26} />
          <p className="empty-state-body" style={{ marginTop: 2 }}>
            {depositDisabled
              ? `No deposits yet — this vault opens when the ${fmtCompact(vault.capex, vault.currency)} raise goes live. Your wallet is connected and ready.`
              : `No deposits yet. The first ${fmtCompact(vault.capex, vault.currency)} of this raise is still open.`}
          </p>
        </div>
      ) : (
      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "16px 0 6px" }}>
        {/* centerLabel was sharePct.toFixed(0). One value, three presentations,
            all three on screen together in this card: the donut centre rounded
            to whole percent, the legend item 40px to its right printed
            toFixed(2), and the "Your share" row below already used
            fmtPct(sharePct, 2). Rounding also destroyed the number it was
            displaying — a depositor holding 0.4% of the vault read "0%" in the
            largest text on their own position card, beside a legend saying
            "0.40%". */}
        <Donut
          size={112}
          segments={[
            { value: Math.max(sharePct, 0.001), color: "var(--accent)" },
            { value: othersPct, color: "rgba(255,255,255,0.08)" },
          ]}
          centerLabel={fmtPct(sharePct, 2)}
          centerSub="Your share"
        />
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 12 }}>
          <LegendItem color="var(--accent)" name="You" value={fmtMoney(deposited, "USD")} pct={sharePct} />
          <LegendItem color="rgba(255,255,255,0.18)" name="Others" value={fmtMoney(others, "USD")} pct={othersPct} />
        </div>
      </div>
      )}
      <div className="divider" />
      <div className="rows">
        <Row k="Your RLUSD" v={fmtMoney(rlusdBalance, "USD")} />
        {/* Every row below is trivially zero until someone deposits, and three
            rows of "$0.00 / 0.00% / €0.00" read as a broken feed rather than an
            empty one. "Your RLUSD" stays in both states — it is the one figure
            that is true and useful before a deposit exists.
            "Your share" is also the donut's own centre label, so it appeared
            twice, 100px apart, whenever the donut was drawn. */}
        {!noDistribution && <Row k="Your deposit" v={fmtMoney(deposited, "USD")} />}
        {/* vault.currency, not "USD". The two rows above are genuinely RLUSD —
            an RLUSD balance and an RLUSD principal — but claimable is typed
            "claimable yield (vault currency)", and every other place that draws
            it agrees: the claim toast, ClaimCard's hero and button, and both
            portfolio call sites all pass the vault currency. These two lines
            were the only ones hardcoding a symbol.

            Visible today, one nav click apart: this card read "Claimable yield
            $0.00" while the portfolio tile for the same field read "€0.00".
            Worse once a vault goes active, because ClaimCard and this card
            render together — two Claim buttons, one number, two symbols. */}
        {!noDistribution && <Row k="Claimable yield" v={fmtMoney(claimable, vault.currency)} accent />}
      </div>
      {/* Rendered only when it will hold something. On a coming_soon vault both
          conditions below are false, so this was an empty grid contributing
          18px of padding and an auto top margin that pushed itself to the
          bottom of a 792px card — reserving a footer for actions that never
          arrive. */}
      {(!depositDisabled || showClaim) && (
      <div style={{ marginTop: "auto", paddingTop: 18, display: "grid", gap: 10 }}>
        {/* On a pipeline vault this was a second, identical disabled button
            saying the same thing as the one in the Fundraising card. Two dead
            controls do not communicate twice as clearly. */}
        {!depositDisabled && (
          <button className="btn btn-ghost btn-block" onClick={onDeposit}>
            Deposit into Vault
          </button>
        )}
        {showClaim && (
          <button className="btn btn-accent btn-block" onClick={onClaim} disabled={claimable <= 0}>
            {claimable > 0 ? `Claim ${fmtMoney(claimable, vault.currency)}` : "Nothing to claim"}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

function LegendItem({ color, name, value, pct }: { color: string; name: string; value: string; pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span className="dot" style={{ background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{name} · <span className="num">{value}</span></div>
        <div className="muted num" style={{ fontSize: "0.75rem" }}>{pct.toFixed(2)}%</div>
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
  const isGrossHeadline = apyBpsIsGross(vault);
  // Focus trap, Escape, scroll lock and focus restore. This dialog takes a
  // deposit amount and had none of them — Tab left the modal on the very first
  // field, and the page behind scrolled under it. See ./useDialog.
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, panelRef);
  const [amount, setAmount] = useState("");
  const amt = parseFloat(amount) || 0;
  const tooMuch = amt > rlusdBalance;
  const overCap = amt > remaining;
  const valid = amt > 0 && !tooMuch && !overCap && kycOk;
  const maxAmt = Math.min(rlusdBalance, remaining);

  // A disabled button with no stated reason is a dead end: the user types an
  // amount, the CTA greys out, and nothing says which of four conditions
  // failed. Name the blocker, and only once they've typed something.
  const blocker = !kycOk
    ? "Complete KYC verification to deposit."
    : tooMuch
    ? `That's more than your balance of ${fmtMoney(rlusdBalance, "USD")} RLUSD.`
    : overCap
    // vault.currency, not "USD". `remaining` is capex minus raised — both
    // asset-side, both EUR — and the tile at the top of this page calls that
    // quantity "Target raise €3.20M". The balance line directly above is RLUSD
    // and correctly stays USD; the vault's room is not the same currency.
    ? `This vault has ${fmtMoney(remaining, vault.currency)} of room left.`
    : null;
  const showBlocker = amount.trim() !== "" && !!blocker;

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
    <div className="overlay" onMouseDown={scrimDismiss(onClose)}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-modal-title"
        tabIndex={-1}
      >
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span id="deposit-modal-title">Deposit into {vault.shortName}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}><XIcon size={18} /></button>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          {/* This is the field that moves money, and it had no accessible name
              at all — it already carried aria-invalid and aria-describedby, so
              it announced "edit, invalid" without ever saying what it was for.
              The balance is a description rather than part of the name, so the
              name stays "Amount" and the balance is still read after it. */}
          <div className="field-label">
            <label htmlFor="deposit-amount">Amount</label>
            <span className="muted num" id="deposit-balance">Balance: {fmtMoney(rlusdBalance, "USD")} RLUSD</span>
          </div>
          <div className="input-suffix">
            <input
              id="deposit-amount"
              className={`input${showBlocker ? " invalid" : ""}`}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={showBlocker}
              aria-describedby={showBlocker ? "deposit-blocker deposit-balance" : "deposit-balance"}
              // The "RLUSD + MAX" suffix overlays the input's right edge, so
              // that width has to be reserved or a long amount slides under it.
              // 92px was already 15px short before MAX was grown; measured at
              // 121px now, rounded up for the widest balance.
              style={{ paddingRight: 128 }}
            />
            <span className="suffix">
              RLUSD{" "}
              {/* Without type="button" this submits any ancestor form. */}
              {/* Was 43x24 — scraping the 24px WCAG 2.5.8 floor, on the control
                  that fills in the amount of money being deposited, while the
                  equivalent "Max" in the sell modal is 38px. Grown to 34px and
                  given a radius; it still clears the 50px input it sits in. */}
              <button
                type="button"
                aria-label={`MAX — fill in ${fmtMoney(maxAmt, "USD")} RLUSD`}
                onClick={() => setAmount(String(maxAmt))}
                style={{
                  display: "inline-flex", alignItems: "center", minHeight: 34,
                  background: "var(--accent-dim)", color: "var(--accent)", border: "none",
                  borderRadius: "var(--r-control)", padding: "0 11px",
                  fontSize: "0.6875rem", fontWeight: 700, cursor: "pointer", marginLeft: 6,
                }}
              >
                MAX
              </button>
            </span>
          </div>
          {/* Always mounted, empty when there is nothing to say. Two reasons:
              a role="alert" inserted into the DOM *with* its text already in
              place is announced unreliably — several screen readers only pick
              up a change to a region that was already there; and rendering it
              conditionally resized the dialog. This modal is centred, so
              appearing text pushed it up by half and the confirm button down
              by the other half, 13px on desktop and 22px at 390px, while the
              user was mid-keystroke on an amount of money.
              .field-error:empty reserves one line and drops the "!" badge. */}
          <p className="field-error" id="deposit-blocker" role="alert">
            {showBlocker ? blocker : ""}
          </p>
        </div>

        <div className="rows" style={{ marginBottom: 4 }}>
          <Row k="You receive" v={`${fmtNum(amt)} ${vault.symbol}`} />
          <Row k="Vault remaining" v={fmtMoney(remaining, vault.currency)} />
          <Row k="Receipt token" v="XRPL MPT share · tradeable" />
          {/* Same field, and this is the panel where it matters most: what a
              depositor is about to commit to. When apyBps is gross, the
              depositor's own share is split.depositorBps and lower. Labelled
              accurately here; swapping the figure is the founder call. */}
          <Row k={isGrossHeadline ? "Projected gross yield" : "Projected APY"} v={fmtPct(bpsToPct(vault.apyBps))} accent />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: kycOk ? "var(--accent)" : "var(--amber)", margin: "10px 0 4px" }}>
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
