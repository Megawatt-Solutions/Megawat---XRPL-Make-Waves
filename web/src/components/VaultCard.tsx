import Link from "next/link";
import type { Vault } from "@/lib/types";
import { fmtPct, bpsToPct, fmtPower, fmtCompact, fmtEnergy } from "@/lib/format";
import { raiseProgress } from "@/lib/vaults";
import { socSeries } from "@/lib/bess";
import { Sparkline } from "./Sparkline";
import { BoltIcon, SunIcon, BatteryIcon } from "./Icons";
import { Flag } from "./Flag";
import { apyBpsIsGross } from "@/lib/vaults";
import { STATUS_BADGE } from "./vaultStatus";

const STATUS_CARD: Record<Vault["status"], string> = {
  active: "vc-active",
  operational: "vc-operational",
  fundraising: "vc-fundraising",
  coming_soon: "vc-pipeline",
};

/** The card's third metric — one function, because the value and its label were
 *  two separate ternaries that had to agree and did not.
 *
 *  coming_soon fell into the else-branch and rendered `capex` under the label
 *  **TVL**, directly above "Opens for fundraising next quarter". Nothing is
 *  locked in a site that has not started raising: the number was the target,
 *  and the card contradicted itself on four of the six tiles on the landing
 *  page. VaultDetail already got this right, calling the same figure
 *  "Target raise" for coming_soon.
 *
 *  Returning both together is the actual fix. A value ternary and a label
 *  ternary sitting three lines apart is the shape that has drifted here
 *  thirteen times: someone extends one branch and the other keeps its old
 *  answer, and the diff looks complete.
 *
 *  Not a `switch` with a `never` default, which is where this pass started.
 *  The choice is two-dimensional — status decides raising-vs-running, `kind`
 *  decides whether a running site quotes revenue or TVL — so an exhaustive
 *  switch on status alone would be exhaustive over the wrong axis. Compound
 *  conditions are the honest shape here and match protocol.ts.
 */
function headlineMetric(vault: Vault): { value: number; label: string } {
  // Raising, or about to: the figure is what they are raising toward.
  if (vault.status === "fundraising" || vault.status === "coming_soon") {
    return { value: vault.capex, label: "Target" };
  }
  // Running. A showcase site is not investable, so its headline is what it
  // earns; an on-chain one shows the capital behind it.
  return vault.kind === "showcase"
    ? { value: vault.annualRevenue, label: "Annual rev." }
    : { value: vault.capex, label: "TVL" };
}

export function VaultCard({ vault }: { vault: Vault }) {
  const badge = STATUS_BADGE[vault.status];
  const isShowcase = vault.kind === "showcase";
  // Keyed on what apyBps actually holds, not on `kind`. BESS Leipzig 01 is
  // on-chain and its apyBps IS a gross yield, so the old kind-based guess
  // printed "APY" over one. Only bess-belgrade-01 genuinely quotes a
  // depositor APY here today.
  const apyLabel = apyBpsIsGross(vault) ? "Gross yield" : "APY";
  const progress = raiseProgress(vault);
  const headline = headlineMetric(vault);

  return (
    <Link href={`/vault/${vault.id}`} className={`vault-card ${STATUS_CARD[vault.status]}`}>
      <div className="vault-card-top">
        {/* flex:1 so the name/location block claims the space rather than
            being squeezed to a sliver by the status badge beside it. */}
        <div style={{ display: "flex", gap: 13, minWidth: 0, flex: 1 }}>
          <span className="vault-thumb">
            {vault.spec.hasSolar ? <SunIcon size={22} /> : <BatteryIcon size={22} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="vault-name">{vault.name}</div>
            <div className="vault-loc">
              <Flag code={vault.flag} size={13} /> {vault.location}
            </div>
          </div>
        </div>
        <span className={`badge ${badge.cls}`}>
          {vault.status === "active" && <span className="dot pulse" style={{ background: "var(--accent)" }} />}
          {badge.label}
        </span>
      </div>

      <div className="vault-metrics">
        <div>
          <div className="vm-value accent">{fmtPct(bpsToPct(vault.apyBps))}</div>
          <div className="vm-label">{apyLabel}</div>
        </div>
        <div>
          <div className="vm-value">{fmtPower(vault.spec.powerKw)}</div>
          <div className="vm-label">{fmtEnergy(vault.spec.energyKwh)}</div>
        </div>
        <div>
          <div className="vm-value">{fmtCompact(headline.value, vault.currency)}</div>
          <div className="vm-label">{headline.label}</div>
        </div>
      </div>

      {/* Status-specific footer */}
      {vault.status === "fundraising" ? (
        <div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: "0.75rem" }}>
            <span className="accent" style={{ fontWeight: 600 }}>{Math.round(progress * 100)}% funded</span>
            <span className="muted num">
              {fmtCompact(vault.raised, vault.currency)} / {fmtCompact(vault.capex, vault.currency)}
            </span>
          </div>
        </div>
      ) : vault.status === "coming_soon" ? (
        <div className="muted" style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 7 }}>
          <BoltIcon size={13} /> Opens for fundraising next quarter
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Solid dot, not `pulse`. This card has no useEffect, no interval
              and never calls simulate() — socPct and healthPct are read
              straight off the static vaults.ts constants. Measured on the
              landing page: seven samples over 24s, one distinct value.

              VaultDetail's Revenue card keeps its pulse and has earned it —
              same window, seven distinct values, because that component ticks
              simulate(vault, t) every 2200ms. Same animation for both meant the
              app's most-seen page advertised a telemetry stream over two frozen
              numbers, and made the badge worthless where it is true.

              The readings still belong here; a solid accent dot says the site
              is operational, which it is. Only the claim that they are moving
              is gone. */}
          <span className="live">
            <span className="dot" style={{ background: "var(--accent)" }} />
            {vault.metrics.socPct.toFixed(1)}% SoC · {vault.metrics.healthPct.toFixed(1)}% health
          </span>
          <Sparkline data={socSeries(vault, 28)} />
        </div>
      )}

      {/* A showcase vault is not investable, and until now the card never said
          so. It knew — `isShowcase` already switches the metric label to "Gross
          yield" — but that is a wording change most people will not parse as
          "you cannot buy this". So the overview showed "OPERATIONAL", a live
          SoC readout and "12.2% Gross yield" under a page promising you can
          invest, and the qualifier only appeared one click later.

          VaultDetail already made exactly this fix for exactly this reason:
          "a financial page must not put its most important qualifier last."
          The pipeline cards likewise state their availability in the footer
          ("Opens for fundraising next quarter"). This is the same slot saying
          the same kind of thing for the third case. */}
      {isShowcase && (
        <div className="vc-availability">
          {/* Same blue dot VaultDetail uses for this exact statement, so the
              two surfaces read as one message rather than two designs. */}
          <span className="dot" style={{ background: "var(--blue)" }} /> Showcase site · not investable
        </div>
      )}
    </Link>
  );
}
