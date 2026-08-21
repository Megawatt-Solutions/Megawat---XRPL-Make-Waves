"use client";
// Sweep feed — every monthly revenue sweep with its reconciliation refs
// (meter / TSO / bank). The admin's "Simulate month" button plays the SPV +
// exchange leg with revenue randomised ±20% around the reference so the NAV
// chart moves and the performance factor breathes.
import { useMemo, useState } from "react";
import { hexlify, randomBytes } from "ethers";
import { useStream } from "@/lib/stream/StreamProvider";
import { bpsToPct, fmtPct } from "@/lib/format";
import { shortHash, usd6 } from "./bits";

export function Sweeps() {
  const { data, roles, run, ensureAllowance, busy } = useStream();
  const [trancheId, setTrancheId] = useState(0);
  const streaming = useMemo(() => (data?.tranches ?? []).filter((t) => t.state === 1), [data]);
  const t = data?.tranches.find((x) => x.id === trancheId && x.state === 1) ?? streaming[0];
  if (!data) return null;

  const simulate = async () => {
    if (!t) return;
    // reference monthly gross ± 20%
    const reference = (t.refMWhTotal * t.expRevPerMWh) / BigInt(t.termMonths);
    const jitter = 0.8 + Math.random() * 0.4;
    const gross = (reference * BigInt(Math.round(jitter * 1000))) / 1000n;
    const swept = (gross * BigInt(data.sweepShareBps)) / 10_000n;
    if (!(await ensureAllowance(swept))) return;
    await run(`Simulate month ${t.monthsSwept + 1} — gross ${usd6(gross, 0)}`, (c) =>
      c.vault.sweep(t.id, gross, gross - swept, hexlify(randomBytes(32)), hexlify(randomBytes(32)), hexlify(randomBytes(32)))
    );
  };

  return (
    <>
      {roles.megawatt && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">Simulate a month (admin)</div>
          {!t ? (
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>No tranche is Streaming yet.</p>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              {streaming.length > 1 && (
                <select className="input" style={{ maxWidth: 280 }} value={t.id} onChange={(e) => setTrancheId(Number(e.target.value))}>
                  {streaming.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <button className="btn btn-accent" disabled={!!busy || t.monthsSwept >= t.termMonths} onClick={simulate}>
                Simulate month {t.monthsSwept + 1} / {t.termMonths}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                Pulls {fmtPct(bpsToPct(data.sweepShareBps))} of a randomised gross (±20% around reference) into reserves.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">Sweep feed</div>
        {!data.sweeps.length ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            No revenue swept yet. Sweeps appear here with their meter, TSO and bank reconciliation references.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="caps" style={{ textAlign: "left" }}>
                  <th style={{ padding: "6px 10px 6px 0" }}>Month</th>
                  <th style={{ padding: "6px 10px" }}>Tranche</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Gross</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Swept ({fmtPct(bpsToPct(data.sweepShareBps))})</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Owner remainder</th>
                  <th style={{ padding: "6px 10px" }}>Meter</th>
                  <th style={{ padding: "6px 10px" }}>TSO</th>
                  <th style={{ padding: "6px 10px" }}>Bank</th>
                </tr>
              </thead>
              <tbody>
                {data.sweeps.map((s, i) => (
                  <tr key={`${s.txHash}-${i}`} style={{ borderTop: "1px solid var(--mw-mist, rgba(255,255,255,0.06))" }}>
                    <td className="num" style={{ padding: "7px 10px 7px 0" }}>{s.month}</td>
                    <td style={{ padding: "7px 10px" }}>{data.tranches[s.trancheId]?.name ?? s.trancheId}</td>
                    <td className="num" style={{ padding: "7px 10px", textAlign: "right" }}>{usd6(s.gross, 0)}</td>
                    <td className="num accent" style={{ padding: "7px 10px", textAlign: "right" }}>{usd6(s.swept, 0)}</td>
                    <td className="num" style={{ padding: "7px 10px", textAlign: "right" }} title="Released unconditionally to the site owner">
                      {usd6(s.ownerRemainder, 0)}
                    </td>
                    <td className="num muted" style={{ padding: "7px 10px" }} title={s.meterRef}>{shortHash(s.meterRef, 8)}</td>
                    <td className="num muted" style={{ padding: "7px 10px" }} title={s.tsoRef}>{shortHash(s.tsoRef, 8)}</td>
                    <td className="num muted" style={{ padding: "7px 10px" }} title={s.bankRef}>{shortHash(s.bankRef, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          The owner remainder is released unconditionally — only the swept share enters the vault&apos;s reserve
          compartment. Nothing is distributed: NAV per unit rises instead.
        </p>
      </div>
    </>
  );
}
