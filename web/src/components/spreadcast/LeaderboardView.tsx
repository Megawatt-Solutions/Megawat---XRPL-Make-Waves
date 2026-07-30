"use client";

import { useEffect, useState } from "react";
import { PRIZE_POOL, prizeForRank } from "@/lib/spreadcast/prizes";

interface Row {
  rank: number;
  name: string;
  verified: boolean;
  wallet: string | null;
  points: number;
  played: number;
  correct: number;
  streak: number;
  absError: number | null;
  isDemo: boolean;
  /** Has a live forecast awaiting the 15:00 settlement. */
  pending?: boolean;
  /** That pending forecast is committed on-chain (real tx). */
  signedPending?: boolean;
}

export function LeaderboardView() {
  const [scope, setScope] = useState<"week" | "season">("week");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    fetch(`/api/spreadcast/leaderboard?scope=${scope}${verifiedOnly ? "&verified=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d.rows));
  }, [scope, verifiedOnly]);

  return (
    <>
      <h1>Leaderboard</h1>
      <p className="sc-sub">
        10 points per correct call · streak multiplier up to ×3 · ties broken by the closest exact guesses.
      </p>
      <div className="sc-prizebar">
        <div>
          <div className="label">{PRIZE_POOL.season} prize pool · top 10</div>
          <div className="amount">${PRIZE_POOL.total} <small>{PRIZE_POOL.currency}</small></div>
        </div>
        <div>
          <div className="sc-prize-split">
            {PRIZE_POOL.split.map((amt, i) => (
              <span key={i} className={i < 3 ? "top" : ""}>#{i + 1} · ${amt}</span>
            ))}
          </div>
          <div className="label" style={{ marginTop: 6 }}>
            promotional awards · verified players · paid in RLUSD on XRPL
          </div>
        </div>
      </div>
      <div className="sc-lb-controls">
        <div className="sc-seg">
          <button className={scope === "week" ? "on" : ""} onClick={() => setScope("week")}>
            This week
          </button>
          <button className={scope === "season" ? "on" : ""} onClick={() => setScope("season")}>
            Season
          </button>
        </div>
        <div className="sc-seg">
          <button className={!verifiedOnly ? "on" : ""} onClick={() => setVerifiedOnly(false)}>
            Everyone
          </button>
          <button className={verifiedOnly ? "on" : ""} onClick={() => setVerifiedOnly(true)}>
            Verified · prize-eligible
          </button>
        </div>
      </div>
      <div className="panel sc-panel" style={{ padding: 0, overflowX: "auto" }}>
        <table className="sc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>PLAYER</th>
              <th>WALLET</th>
              <th className="num">POINTS</th>
              <th className="num">PLAYED</th>
              <th className="num">HIT RATE</th>
              <th className="num">STREAK</th>
              <th className="num">TIEBREAK ERR</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              <tr>
                <td colSpan={8} className="muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No predictions yet this period — lock in the first one on the Play tab.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.rank}>
                  <td className={r.rank === 1 ? "sc-rank-1" : "sc-mono"}>
                    {r.rank}
                    {prizeForRank(r.rank) != null && <div className="sc-prize-amt">${prizeForRank(r.rank)}</div>}
                  </td>
                  <td>
                    {r.name} {r.verified && <span className="sc-tag v">V</span>}{" "}
                    {r.pending && (
                      <span className="sc-tag" style={{ color: "var(--amber)", borderColor: "color-mix(in srgb, var(--amber) 40%, transparent)" }}>
                        prediction in
                      </span>
                    )}{" "}
                    {r.signedPending && <span className="sc-tag v">on-chain</span>}
                  </td>
                  <td className="sc-mono muted">{r.wallet ?? "—"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{r.points}</td>
                  <td className="num">{r.played || "—"}</td>
                  <td className="num">{r.played ? `${Math.round((r.correct / r.played) * 100)}%` : "—"}</td>
                  <td className="num">{r.streak > 0 ? <span className="sc-streak-flame">🔥{r.streak}</span> : "—"}</td>
                  <td className="num muted">{r.absError == null ? "—" : r.absError.toFixed(1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Verified = XRPL wallet connected. &ldquo;Prediction in&rdquo; = prediction awaiting today&apos;s 15:00 result;
        &ldquo;on-chain&rdquo; = that prediction is locked on XRPL mainnet. Prize pool is split across the top 10 of the season leaderboard. Prize-eligibility requires verified
        status; awards are promotional and occasional, announced per cycle.
      </p>
    </>
  );
}
