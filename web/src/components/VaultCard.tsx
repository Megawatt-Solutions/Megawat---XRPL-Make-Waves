import Link from "next/link";
import type { Vault } from "@/lib/types";
import { fmtPct, bpsToPct, fmtPower, fmtCompact, fmtEnergy } from "@/lib/format";
import { raiseProgress } from "@/lib/vaults";
import { socSeries } from "@/lib/bess";
import { Sparkline } from "./Sparkline";
import { BoltIcon, SunIcon, BatteryIcon } from "./Icons";
import { Flag } from "./Flag";
import { STATUS_BADGE } from "./vaultStatus";

const STATUS_CARD: Record<Vault["status"], string> = {
  active: "vc-active",
  operational: "vc-operational",
  fundraising: "vc-fundraising",
  coming_soon: "vc-pipeline",
};

export function VaultCard({ vault }: { vault: Vault }) {
  const badge = STATUS_BADGE[vault.status];
  const isShowcase = vault.kind === "showcase";
  const apyLabel = isShowcase ? "Gross yield" : "APY";
  const progress = raiseProgress(vault);

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
          <div className="vm-value">
            {vault.status === "fundraising"
              ? fmtCompact(vault.capex, vault.currency)
              : isShowcase
              ? fmtCompact(vault.annualRevenue, vault.currency)
              : fmtCompact(vault.capex, vault.currency)}
          </div>
          <div className="vm-label">
            {vault.status === "fundraising" ? "Target" : isShowcase ? "Annual rev." : "TVL"}
          </div>
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
          <span className="live">
            <span className="dot pulse" style={{ background: "var(--accent)" }} />
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
