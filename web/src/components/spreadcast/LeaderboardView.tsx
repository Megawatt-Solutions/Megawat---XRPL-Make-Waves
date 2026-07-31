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
      {/* The two filters above reload the table underneath. Sighted, that reads
          as skeleton rows then results; to a screen reader nothing happened at
          all, so the controls appear inert. This says what the filter did.

          Polite, not assertive: it is the result of something the user just
          did, not an interruption worth cutting across them for. */}
      <div className="sr-only" role="status" aria-live="polite">
        {rows == null
          ? "Loading leaderboard"
          : `${rows.length} ${rows.length === 1 ? "player" : "players"}, ${
              scope === "week" ? "this week" : "this season"
            }${verifiedOnly ? ", verified only" : ""}`}
      </div>
      <div className="panel sc-panel" style={{ padding: 0, overflowX: "auto" }}>
        <table className="sc-table sc-t-lb">
          <thead>
            <tr>
              {/* Reads as "number sign" otherwise, which names nothing. */}
              <th scope="col" aria-label="Rank">#</th>
              <th scope="col">PLAYER</th>
              <th scope="col">WALLET</th>
              <th scope="col" className="num">POINTS</th>
              <th scope="col" className="num">PLAYED</th>
              <th scope="col" className="num">HIT RATE</th>
              <th scope="col" className="num">STREAK</th>
              <th scope="col" className="num">TIEBREAK ERR</th>
            </tr>
          </thead>
          <tbody>
            {rows == null ? (
              // Placeholder rows keep the table's height while it loads, so
              // the panel doesn't collapse and then jump.
              <>
                {[0, 1, 2, 3, 4].map((n) => (
                  <tr key={n} aria-hidden="true">
                    <td colSpan={8} style={{ padding: "10px 12px" }}>
                      <div className="skel skel-line" style={{ marginBottom: 0 }} />
                    </td>
                  </tr>
                ))}
              </>
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
                    {/* Only project a prize once a player has actually scored.
                        Showing "$125" beside 0 points implies a payout earned
                        by being the only entrant, which is not a claim this
                        page should make — it is a page about prize money. */}
                    {r.points > 0 && prizeForRank(r.rank) != null && (
                      <div className="sc-prize-amt">${prizeForRank(r.rank)}</div>
                    )}
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
      {/* A single row under a "$500 · TOP 10" pool reads as an empty room
          rather than an early one. Name it, and make the sparseness the
          reason to play rather than a reason to doubt. */}
      {rows != null && rows.length > 0 && rows.length < 4 && (
        <p className="sc-board-early">
          Only {rows.length === 1 ? "one player has" : `${rows.length} players have`} entered this period — the
          board fills as the week runs, and every prize tier is still open.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Verified = XRPL wallet connected. &ldquo;Prediction in&rdquo; = prediction awaiting today&apos;s 15:00 result;
        &ldquo;on-chain&rdquo; = that prediction is locked on XRPL mainnet. Prize pool is split across the top 10 of the season leaderboard. Prize-eligibility requires verified
        status; awards are promotional and occasional, announced per cycle.
      </p>
    </>
  );
}
