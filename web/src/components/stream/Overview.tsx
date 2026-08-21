"use client";
// Overview — live architecture mirror of the whitepaper's Fig. 1: escrow
// compartments, reserve compartment, pool NAV, units, and the NAV chart.
import { useStream } from "@/lib/stream/StreamProvider";
import { bpsToPct, fmtPct } from "@/lib/format";
import { Kv, Progress, StateBadge, units6, usd6 } from "./bits";
import { NavChart } from "./NavChart";

export function Overview() {
  const { data } = useStream();
  if (!data) return null;

  const navPerUnit = data.totalUnitsLive > 0n ? (data.poolNav * 1_000_000n) / data.totalUnitsLive : 0n;
  const escrowTranches = data.tranches.filter((t) => t.state === 0);

  return (
    <>
      <div className="tile-grid" style={{ marginBottom: 18 }}>
        <div className="tile">
          <span className="caps">Pool NAV</span>
          <div className="tile-value num">{usd6(data.poolNav, 0)}</div>
          <div className="tile-sub">reserves + PV of remaining revenue</div>
        </div>
        <div className="tile">
          <span className="caps">NAV per unit</span>
          <div className="tile-value num">{data.totalUnitsLive > 0n ? usd6(navPerUnit) : "—"}</div>
          <div className="tile-sub">rises with every sweep — no distributions</div>
        </div>
        <div className="tile">
          <span className="caps">Reserves</span>
          <div className="tile-value num">{usd6(data.reservesValue, 0)}</div>
          <div className="tile-sub">swept revenue, parked in T-bills at {fmtPct(bpsToPct(data.aprBps))} APR</div>
        </div>
        <div className="tile">
          <span className="caps">Units outstanding</span>
          <div className="tile-value num">{units6(data.totalUnitsLive)}</div>
          <div className="tile-sub">1 unit ≙ 1 reference MWh</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">NAV per unit</div>
        <NavChart history={data.navHistory} sweeps={data.sweeps} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {escrowTranches.map((t) => (
          <div className="card" key={t.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="card-title" style={{ margin: 0 }}>Escrow — {t.name}</div>
              <StateBadge state={t.state} />
            </div>
            <div style={{ marginTop: 10 }}>
              <Kv k="Principal deposited" v={usd6(t.escrowPrincipal, 0)} />
              <Kv k="Escrow value (T-bill)" v={usd6(t.escrowValue, 0)} />
              <Kv
                k="Accrued yield"
                v={<span className="accent">{usd6(t.escrowValue - t.escrowPrincipal)}</span>}
                title="Accrues to depositors: refunded on longstop failure, or buys proportionally more units at conversion"
              />
              <Kv k="Subscription" v={`${((Number(t.escrowPrincipal) / Number(t.capexTarget)) * 100).toFixed(1)}% of ${usd6(t.capexTarget, 0)}`} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={Number(t.escrowPrincipal)} max={Number(t.capexTarget)} />
            </div>
          </div>
        ))}
        <div className="card">
          <div className="card-title">Compartment segregation</div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: "8px 0 0" }}>
            Escrow and reserves are separate share ledgers against the T-bill vault. No function moves value
            between them: escrow exits only to refunds or the drawdown-only construction budget; reserves fill
            only from sweeps and drain only to redemptions. Proven by an on-repo fuzz invariant.
          </p>
        </div>
      </div>
    </>
  );
}
