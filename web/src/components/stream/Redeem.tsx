"use client";
// Redeem — FIFO queue, epoch cadence, forward pricing. Deposits mint at full
// (optimistic) NAV; redemptions pay NAV minus the spread — the same
// anti-timing asymmetry USD.AI uses, shown explicitly here.
import { useMemo, useState } from "react";
import { useStream } from "@/lib/stream/StreamProvider";
import { SECONDS_PER_MONTH } from "@/lib/stream/config";
import { bpsToPct, fmtAddress, fmtPct } from "@/lib/format";
import { Countdown, Kv, units6, usd6, useNowSec } from "./bits";

export function Redeem() {
  const { data, address, run, busy } = useStream();
  const [trancheId, setTrancheId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const now = useNowSec();

  const redeemable = useMemo(
    () => (data?.tranches ?? []).filter((t) => (t.state === 1 || t.state === 2) && t.myUnits > 0n),
    [data]
  );
  const t = redeemable.find((x) => x.id === trancheId) ?? redeemable[0];
  if (!data) return null;

  const nextEpochAt = data.lastEpochClose + SECONDS_PER_MONTH;
  const epochReady = now >= nextEpochAt;
  const parsed = amount ? BigInt(Math.round(Number(amount) * 1e6)) : 0n;
  const valid = t && parsed > 0n && parsed <= t.myUnits;
  const redeemNav = t ? (t.navPerUnit * BigInt(10_000 - data.redeemSpreadBps)) / 10_000n : 0n;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div className="card-title">Request redemption</div>
          {!address ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Connect a wallet holding vintage units.</p>
          ) : !t ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              No redeemable units in this wallet — units come from a tranche conversion.
            </p>
          ) : (
            <>
              {redeemable.length > 1 && (
                <div className="field" style={{ marginTop: 8 }}>
                  <div className="field-label"><span>Vintage</span></div>
                  <select className="input" value={t.id} onChange={(e) => setTrancheId(Number(e.target.value))}>
                    {redeemable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="field" style={{ marginTop: 8 }}>
                <div className="field-label">
                  <span>Units</span>
                  <button className="field-max" onClick={() => setAmount(String(Number(t.myUnits) / 1e6))}>
                    Max {units6(t.myUnits, 2)}
                  </button>
                </div>
                <input
                  className="input num"
                  inputMode="decimal"
                  placeholder="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
              <div style={{ margin: "8px 0" }}>
                <Kv k="Deposit-side NAV (optimistic)" v={usd6(t.navPerUnit)} />
                <Kv
                  k={`Redeem NAV (−${fmtPct(bpsToPct(data.redeemSpreadBps))} spread)`}
                  v={<span className="accent">{usd6(redeemNav)}</span>}
                  title="Forward pricing: entries mint at full NAV, exits pay NAV minus the spread — timing a sweep nets you nothing"
                />
                {parsed > 0n && <Kv k="Estimated payout" v={usd6((parsed * redeemNav) / 1_000_000n)} />}
              </div>
              <button
                className="btn btn-accent btn-block"
                disabled={!valid || !!busy}
                onClick={() => valid && run(`Request redemption of ${units6(parsed, 2)} units`, (c) => c.vault.requestRedeem(t.id, parsed))}
              >
                Join redemption queue
              </button>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title">Epoch</div>
          <div style={{ marginTop: 8 }}>
            <Kv k="Epochs closed" v={data.epochCount} />
            <Kv k="Next epoch" v={epochReady ? <span className="accent">ready to close</span> : <Countdown until={nextEpochAt} done="ready" />} />
            <Kv k="Liquidity cap" v={`${fmtPct(bpsToPct(data.epochCapBps))} of reserves (${usd6((data.reservesValue * BigInt(data.epochCapBps)) / 10_000n, 0)})`} />
            <Kv k="Reserves" v={usd6(data.reservesValue, 0)} />
          </div>
          <button
            className="btn btn-outline btn-block"
            style={{ marginTop: 10 }}
            disabled={!epochReady || !!busy}
            title="Anyone can close an epoch once per demo-month; the queue is paid FIFO from reserves"
            onClick={() => run("Close epoch & pay queue", (c) => c.vault.closeEpoch())}
          >
            Close epoch & pay queue
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Payouts are pushed automatically at epoch close, FIFO, until the liquidity cap is reached; the
            remainder stays queued for the next epoch.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Redemption queue</div>
        {!data.queue.length ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Queue is empty.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="caps" style={{ textAlign: "left" }}>
                  <th style={{ padding: "6px 10px 6px 0" }}>Position</th>
                  <th style={{ padding: "6px 10px" }}>Holder</th>
                  <th style={{ padding: "6px 10px" }}>Vintage</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Units queued</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Est. payout</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((q, i) => {
                  const qt = data.tranches[q.trancheId];
                  const nav = qt ? (qt.navPerUnit * BigInt(10_000 - data.redeemSpreadBps)) / 10_000n : 0n;
                  const mine = address && q.owner.toLowerCase() === address.toLowerCase();
                  return (
                    <tr key={q.index} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: mine ? "var(--accent-dim)" : undefined }}>
                      <td className="num" style={{ padding: "7px 10px 7px 0" }}>#{i + 1}</td>
                      <td className="num" style={{ padding: "7px 10px" }} title={q.owner}>
                        {fmtAddress(q.owner)}{mine ? " (you)" : ""}
                      </td>
                      <td style={{ padding: "7px 10px" }}>{qt?.name ?? q.trancheId}</td>
                      <td className="num" style={{ padding: "7px 10px", textAlign: "right" }}>{units6(q.units, 2)}</td>
                      <td className="num" style={{ padding: "7px 10px", textAlign: "right" }}>{usd6((q.units * nav) / 1_000_000n, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
