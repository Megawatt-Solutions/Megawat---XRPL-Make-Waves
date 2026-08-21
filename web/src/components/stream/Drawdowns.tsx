"use client";
// Drawdown console — the on-stage multisig demo. Each step is one obvious
// button: engineer posts a certificate, a signer queues against it, a second
// role confirms, the timelock runs, anyone executes. Funds can only land on
// the tranche's fixed SPV account.
import { useMemo, useState } from "react";
import { id as keccakId } from "ethers";
import { ROLES, useStream, type RoleKey } from "@/lib/stream/StreamProvider";
import { fmtAddress } from "@/lib/format";
import { Countdown, Kv, shortHash, usd6, useNowSec } from "./bits";

const ROLE_LABEL: Record<RoleKey, string> = {
  megawatt: "Megawatt",
  agent: "Security agent",
  engineer: "Engineer",
};

export function Drawdowns() {
  const { data, roles, address, run, busy } = useStream();
  const [trancheId, setTrancheId] = useState(0);
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const now = useNowSec();

  const streaming = useMemo(() => (data?.tranches ?? []).filter((t) => t.state === 1), [data]);
  const t = data?.tranches.find((x) => x.id === trancheId && x.state === 1) ?? streaming[0];
  if (!data) return null;

  const certHash = memo.trim() ? keccakId(memo.trim()) : null;
  const parsedAmount = BigInt(Math.max(0, Math.floor(Number(amount || "0")))) * 1_000_000n;
  const myRoles = (Object.keys(ROLES) as RoleKey[]).filter((r) => roles[r]);

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Connected signer</div>
        {address ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <span className="badge badge-soon num">{fmtAddress(address)}</span>
            {myRoles.length ? (
              myRoles.map((r) => <span key={r} className="badge badge-active">{ROLE_LABEL[r]}</span>)
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>No signer roles — read-only on this console.</span>
            )}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Connect a wallet to see your roles.</p>
        )}
      </div>

      {!t ? (
        <div className="card">
          <p className="muted" style={{ fontSize: 13 }}>
            No tranche is Streaming yet — convert one on the Tranches tab to open drawdowns.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 14 }}>
          <div className="card">
            <div className="card-title">1 · Post milestone certificate</div>
            {streaming.length > 1 && (
              <div className="field" style={{ marginTop: 8 }}>
                <div className="field-label"><span>Tranche</span></div>
                <select className="input" value={t.id} onChange={(e) => setTrancheId(Number(e.target.value))}>
                  {streaming.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="field" style={{ marginTop: 8 }}>
              <div className="field-label">
                <span>Milestone memo</span>
                <span className="muted">hashed client-side</span>
              </div>
              <input
                className="input"
                placeholder="Foundations poured — inspection ref 4711"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <Kv k="Certificate hash" v={<span title={certHash ?? undefined}>{certHash ? shortHash(certHash) : "—"}</span>} />
            <Kv k="Latest on-chain cert" v={<span title={t.latestCert}>{shortHash(t.latestCert)}{t.latestCertUsed ? " (used)" : ""}</span>} />
            <button
              className="btn btn-accent btn-block"
              style={{ marginTop: 10 }}
              disabled={!roles.engineer || !certHash || !!busy}
              title={roles.engineer ? undefined : "Requires the Engineer role"}
              onClick={() => certHash && run("Post milestone certificate", (c) => c.vault.postMilestoneCert(t.id, certHash, memo.trim()))}
            >
              Post certificate (Engineer)
            </button>
          </div>

          <div className="card">
            <div className="card-title">2 · Queue drawdown</div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0" }}>
              Queued against the latest certificate, into a {data.timelock}s timelock. Destination is fixed:
              the tranche&apos;s SPV account <span className="num" title={t.spvAccount}>{fmtAddress(t.spvAccount)}</span>.
            </p>
            <div className="field">
              <div className="field-label">
                <span>Amount (dUSD)</span>
                <button className="field-max" onClick={() => setAmount(String(Number(t.budgetRemaining / 1_000_000n)))}>
                  Budget {usd6(t.budgetRemaining, 0)}
                </button>
              </div>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="2000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <button
              className="btn btn-accent btn-block"
              style={{ marginTop: 10 }}
              disabled={
                !myRoles.length || !!busy || parsedAmount === 0n || parsedAmount > t.budgetRemaining ||
                t.latestCert === "0x" + "0".repeat(64) || t.latestCertUsed
              }
              title={myRoles.length ? undefined : "Requires any signer role"}
              onClick={() => run(`Queue drawdown of ${usd6(parsedAmount, 0)}`, (c) => c.vault.queueDrawdown(t.id, parsedAmount, t.latestCert))}
            >
              Queue drawdown (any signer)
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Drawdowns — 2-of-3 confirm, timelock, execute</div>
        {!data.drawdowns.length ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Nothing queued yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            {[...data.drawdowns].reverse().map((d) => {
              const tr = data.tranches[d.trancheId];
              const ready = d.confirmations >= 2 && now >= d.eta && !d.executed && !tr?.latestCertUsed;
              return (
                <div key={d.id} className="surface" style={{ padding: 14, borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span className="num" style={{ fontSize: 15 }}>{usd6(d.amount, 0)}</span>
                      <span className="muted" style={{ fontSize: 12 }}> · #{d.id} · {tr?.name ?? `tranche ${d.trancheId}`}</span>
                    </div>
                    {d.executed ? (
                      <span className="badge badge-operational">Executed</span>
                    ) : (
                      <span className="badge badge-fundraising">{d.confirmations}/2 confirmations</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, margin: "8px 0" }}>
                    <span className="muted">cert <span className="num" title={d.certHash}>{shortHash(d.certHash)}</span></span>
                    <span className="muted">
                      timelock{" "}
                      {d.executed ? "—" : now >= d.eta ? <span className="accent">elapsed</span> : <Countdown until={d.eta} done="elapsed" />}
                    </span>
                    {(Object.keys(ROLES) as RoleKey[]).map((r) => (
                      <span key={r} className={d.confirmedBy[r] ? "accent" : "muted"} style={{ fontSize: 12 }}>
                        {d.confirmedBy[r] ? "✓" : "○"} {ROLE_LABEL[r]}
                      </span>
                    ))}
                  </div>
                  {!d.executed && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {myRoles.filter((r) => !d.confirmedBy[r]).map((r) => (
                        <button
                          key={r}
                          className="btn btn-outline btn-sm"
                          disabled={!!busy}
                          onClick={() => run(`Confirm #${d.id} as ${ROLE_LABEL[r]}`, (c) => c.vault.confirmDrawdown(d.id, ROLES[r]))}
                        >
                          Confirm as {ROLE_LABEL[r]}
                        </button>
                      ))}
                      <button
                        className="btn btn-accent btn-sm"
                        disabled={!ready || !!busy}
                        title={ready ? undefined : "Needs 2 confirmations + elapsed timelock + unused cert"}
                        onClick={() => run(`Execute drawdown #${d.id}`, (c) => c.vault.executeDrawdown(d.id))}
                      >
                        Execute → SPV
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
