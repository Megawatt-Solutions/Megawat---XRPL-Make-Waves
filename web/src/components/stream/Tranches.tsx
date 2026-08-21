"use client";
// Tranches — lifecycle cards: subscribe in Pre-deposit, convert at NTP,
// track budget + sweeps while Streaming, refund after a missed longstop.
import { useState } from "react";
import { useStream, type TrancheView } from "@/lib/stream/StreamProvider";
import { ADDRESSES } from "@/lib/stream/config";
import { fmtAddress } from "@/lib/format";
import { Countdown, Kv, Progress, StateBadge, units6, usd6, useNowSec } from "./bits";

export function Tranches() {
  const { data } = useStream();
  const [depositFor, setDepositFor] = useState<TrancheView | null>(null);
  if (!data) return null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {data.tranches.map((t) => (
          <TrancheCard key={t.id} t={t} onDeposit={() => setDepositFor(t)} />
        ))}
      </div>
      {depositFor && <DepositModal t={depositFor} onClose={() => setDepositFor(null)} />}
    </>
  );
}

function TrancheCard({ t, onDeposit }: { t: TrancheView; onDeposit: () => void }) {
  const { data, roles, address, run, busy } = useStream();
  const now = useNowSec();
  if (!data) return null;

  const drawn = data.drawdowns
    .filter((d) => d.trancheId === t.id && d.executed)
    .reduce((s, d) => s + d.amount, 0n);
  const budget0 = t.budgetRemaining + drawn;
  const subscribedPct = Number(t.escrowPrincipal) / Number(t.capexTarget);
  const pastLongstop = now > t.longstop;
  const fullySubscribed = subscribedPct >= 0.9; // deploy threshold: 90%

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>{t.name}</div>
        <StateBadge state={t.state} />
      </div>

      <div style={{ margin: "10px 0 4px" }}>
        <Kv k="Capex target" v={usd6(t.capexTarget, 0)} />
        <Kv k="Reference throughput" v={`${units6(t.refMWhTotal * 1_000_000n)} MWh over ${t.termMonths} months`} />
        <Kv k="Expected revenue" v={`${usd6(t.expRevPerMWh)} / MWh`} />
        <Kv k="SPV drawdown account" v={<span title={t.spvAccount}>{fmtAddress(t.spvAccount)}</span>} />
      </div>

      {t.state === 0 && (
        <>
          <div style={{ margin: "6px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span className="muted">Subscription</span>
              <span className="num">{(subscribedPct * 100).toFixed(1)}%</span>
            </div>
            <Progress value={Number(t.escrowPrincipal)} max={Number(t.capexTarget)} />
          </div>
          <Kv
            k={pastLongstop ? "Longstop" : "Longstop in"}
            v={pastLongstop ? <span style={{ color: "var(--red)" }}>missed — refundable</span> : <Countdown until={t.longstop} />}
          />
          {t.myReceipt > 0n && <Kv k="My locked receipt" v={usd6(t.myReceipt, 0)} />}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {!pastLongstop && (
              <button className="btn btn-accent" style={{ flex: 1 }} onClick={onDeposit} disabled={!!busy}>
                Deposit dUSD
              </button>
            )}
            {!pastLongstop && roles.megawatt && (
              <button
                className="btn btn-outline"
                style={{ flex: 1 }}
                disabled={!fullySubscribed || !!busy}
                title={fullySubscribed ? "PV-parity mint — the oracle sets the ratio" : "Needs ≥ 90% subscription"}
                onClick={() => run(`Convert ${t.name} at NTP`, (c) => c.vault.convertAtNTP(t.id))}
              >
                Convert at NTP
              </button>
            )}
            {pastLongstop && (
              <button
                className="btn btn-outline"
                style={{ flex: 1 }}
                disabled={!!busy}
                onClick={() => run(`Refund tranche ${t.id}`, (c) => c.vault.refund(t.id))}
              >
                Trigger refund
              </button>
            )}
          </div>
        </>
      )}

      {t.state === 1 && (
        <>
          <div style={{ margin: "6px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span className="muted">Budget drawn</span>
              <span className="num">{usd6(drawn, 0)} / {usd6(budget0, 0)}</span>
            </div>
            <Progress value={Number(drawn)} max={Number(budget0)} />
          </div>
          <div style={{ margin: "6px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span className="muted">Months swept</span>
              <span className="num">{t.monthsSwept} / {t.termMonths}</span>
            </div>
            <Progress value={t.monthsSwept} max={t.termMonths} />
          </div>
          <Kv k="NAV per unit" v={<span className="accent">{usd6(t.navPerUnit)}</span>} />
          <Kv k="PV of remaining stream" v={usd6(t.pv, 0)} />
          <Kv
            k="Performance factor"
            v={`${(t.perfFactorBps / 100).toFixed(1)}%`}
            title="Rolling actual/expected revenue, clamped 50–150%. Marks the remaining PV up or down."
          />
          {t.myUnits > 0n && <Kv k="My units" v={units6(t.myUnits, 2)} />}
          {t.monthsSwept >= t.termMonths && (
            <button
              className="btn btn-outline btn-block"
              style={{ marginTop: 10 }}
              disabled={!!busy}
              onClick={() => run(`Expire vintage ${t.id}`, (c) => c.vault.expireVintage(t.id))}
            >
              Expire vintage
            </button>
          )}
        </>
      )}

      {t.state === 2 && (
        <>
          <Kv k="Terminal NAV per unit" v={usd6(t.navPerUnit)} />
          <Kv k="Units outstanding" v={units6(t.supply, 2)} />
          {t.myUnits > 0n && <Kv k="My units" v={units6(t.myUnits, 2)} />}
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
            Term complete. Units redeem at terminal NAV (pure reserves — no PV component) via the Redeem tab.
          </p>
        </>
      )}

      {t.state === 3 && (
        <>
          {t.myReceipt > 0n ? (
            <button
              className="btn btn-accent btn-block"
              style={{ marginTop: 8 }}
              disabled={!address || !!busy}
              onClick={() => run(`Claim refund (tranche ${t.id})`, (c) => c.vault.claimRefund(t.id))}
            >
              Claim refund — {usd6(t.myReceipt, 0)} + accrued
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
              Longstop missed. Depositors reclaim principal + accrued T-bill yield at par.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function DepositModal({ t, onClose }: { t: TrancheView; onClose: () => void }) {
  const { data, address, connect, run, ensureAllowance, busy } = useStream();
  const [amount, setAmount] = useState("");
  if (!data) return null;

  const room = t.capexTarget - t.escrowPrincipal;
  const max = data.myUsd < room ? data.myUsd : room;
  const parsed = BigInt(Math.max(0, Math.floor(Number(amount || "0")))) * 1_000_000n;
  const valid = parsed > 0n && parsed <= room && parsed <= data.myUsd;

  const submit = async () => {
    if (!(await ensureAllowance(parsed))) return;
    const ok = await run(`Deposit ${usd6(parsed, 0)} into ${t.name}`, (c) => c.vault.deposit(t.id, parsed));
    if (ok) onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Pre-deposit — {t.name}</div>
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 14px", lineHeight: 1.5 }}>
          Escrow is parked in the demo T-bill vault; yield accrues to you. Refund at par + accrued if the
          project misses its longstop. On conversion your receipt becomes vintage units at the PV-parity mint.
        </p>
        {!address ? (
          <button className="btn btn-accent btn-block" onClick={connect}>Connect wallet</button>
        ) : (
          <>
            <div className="field">
              <div className="field-label">
                <span>Amount (dUSD)</span>
                <button className="field-max" onClick={() => setAmount(String(Number(max / 1_000_000n)))}>
                  Max {usd6(max, 0)}
                </button>
              </div>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="100000"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                autoFocus
              />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 12px" }}>
              Balance: {usd6(data.myUsd, 0)} · Remaining capacity: {usd6(room, 0)}
              {data.myUsd === 0n && (
                <> — grab test funds from the <b>dUSD faucet</b> in the header first.</>
              )}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={!!busy}>
                Cancel
              </button>
              <button className="btn btn-accent" style={{ flex: 1 }} disabled={!valid || !!busy} onClick={submit}>
                {busy ? "Working…" : "Approve & deposit"}
              </button>
            </div>
          </>
        )}
        <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
          Vault: <span className="num" title={ADDRESSES.streamVault}>{fmtAddress(ADDRESSES.streamVault)}</span> · Base Sepolia
        </p>
      </div>
    </div>
  );
}
