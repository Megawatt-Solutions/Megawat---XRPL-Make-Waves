"use client";

import { useEffect, useState } from "react";
import { PRIZE_POOL, prizeForRank } from "@/lib/spreadcast/prizes";
import { Identicon } from "../Identicon";

interface Row {
  rank: number;
  name: string;
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
  const [rows, setRows] = useState<Row[] | null>(null);
  // `rows === null` meant BOTH "still loading" and "the fetch died", because
  // there was no .catch() at all. Block the API and this table shows its
  // loading skeleton forever — no message, no retry, and the status region
  // below announces "Loading leaderboard" and never says anything again.
  // RoundContext already handles its own failures properly and PlayView renders
  // "Market feed unavailable · Try again" off the back of it; the two
  // view-local fetches on this page and the Log page never got the same.
  const [failed, setFailed] = useState(false);
  // Retry needs its own dependency, and now it is the only one: with the
  // period control gone there is no other state that re-runs this effect.
  // Re-setting a value to what it already holds does NOT re-run it — React
  // bails out on identical state — so a retry built that way does nothing.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setFailed(false);
    // No scope parameter: the route reads anything that is not "week" as
    // "season", and the worker's season branch applies no date filter at all,
    // so this is every settled round ever played. All-time is what the board
    // has always been able to answer; it was just one of two options.
    fetch("/api/spreadcast/leaderboard", { cache: "no-store" })
      // A 500 answers with a body, so .json() resolves and the old code treated
      // an error response as data. Status has to be checked before parsing.
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setRows(d.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => setAttempt((a) => a + 1);

  return (
    <>
      <h1>Leaderboard</h1>
      <p className="sc-sub">
        10 points per correct call · streak multiplier up to ×3 · ties broken by the closest exact guesses.
      </p>
      <div className="sc-prizebar">
        <div>
          <div className="label">Prize pool · top 10</div>
          <div className="amount">${PRIZE_POOL.total} <small>{PRIZE_POOL.currency}</small></div>
        </div>
        <div>
          <div className="sc-prize-split">
            {PRIZE_POOL.split.map((amt, i) => (
              <span key={i} className={i < 3 ? "top" : ""}>#{i + 1} · ${amt}</span>
            ))}
          </div>
          <div className="label" style={{ marginTop: 6 }}>
            promotional awards · paid in RLUSD on XRPL
          </div>
        </div>
      </div>
      {/* There is one board and it is all-time. The week/season pair is gone:
          there are no seasons, so "Season" named a period that will never end
          and "This week" split a board that is thin enough already. Nothing is
          lost — season was the unfiltered query, which is what renders now.

          There is likewise no verified-only filter: every player has proved a
          wallet via Xaman sign-in, so "verified" no longer splits the field.
          The distinction that survives is per-prediction — locked on-chain or
          not — and the row tags below carry it. */}
      {/* Still a live region, though nothing but a retry changes it now.
          Sighted, a reload reads as skeleton rows then results; to a screen
          reader nothing happens at all unless this says so.

          Polite, not assertive: it is the result of something the user just
          did, not an interruption worth cutting across them for. */}
      <div className="sr-only" role="status" aria-live="polite">
        {failed
          ? "Leaderboard unavailable. Could not load the leaderboard."
          : rows == null
          ? "Loading leaderboard"
          : `${rows.length} ${rows.length === 1 ? "player" : "players"}, all time`}
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
            {failed ? (
              <tr>
                <td colSpan={8} style={{ padding: "22px 12px", textAlign: "center" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Leaderboard unavailable</div>
                  <p className="sc-notice" style={{ margin: "0 auto 12px", maxWidth: 420 }}>
                    Standings can&apos;t be loaded right now. The rest of Megawatt is unaffected.
                  </p>
                  <button className="btn btn-ghost btn-sm" onClick={retry}>
                    Try again
                  </button>
                </td>
              </tr>
            ) : rows == null ? (
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
                  No predictions yet - lock in the first one on the Play tab.
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
                    {/* Keyed on the truncated wallet the worker sends, which
                        identiconSeed reduces to the same first-6 + last-4 it
                        takes from a full address — so this is the same mark a
                        player sees in their own wallet pill. A player with no
                        wallet cannot exist under wallet-first identity, but
                        the type still allows null, so fall back rather than
                        render a mark keyed on "". */}
                    {r.wallet && <Identicon address={r.wallet} size={20} className="sc-lb-avatar" />}
                    {r.name}{" "}
                    {r.pending && (
                      <span className="sc-tag" style={{ color: "var(--amber)", borderColor: "color-mix(in srgb, var(--amber) 40%, transparent)" }}>
                        prediction in
                      </span>
                    )}{" "}
                    {r.signedPending && <span className="sc-tag v">on-chain</span>}
                  </td>
                  <td className="sc-mono muted">{r.wallet ?? "–"}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{r.points}</td>
                  <td className="num">{r.played || "–"}</td>
                  <td className="num">{r.played ? `${Math.round((r.correct / r.played) * 100)}%` : "–"}</td>
                  <td className="num">{r.streak > 0 ? <span className="sc-streak-flame">🔥{r.streak}</span> : "–"}</td>
                  <td className="num muted">{r.absError == null ? "–" : r.absError.toFixed(1)}</td>
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
          Only {rows.length === 1 ? "one player has" : `${rows.length} players have`} scored so far. The board
          fills as rounds settle, and every prize tier is still open.
        </p>
      )}
      <p className="muted prose-note" style={{ fontSize: "0.75rem", marginTop: 12 }}>
        &ldquo;Prediction in&rdquo; = prediction awaiting today&apos;s 15:00 result;
        &ldquo;on-chain&rdquo; = that prediction is locked on XRPL mainnet. Only predictions locked on-chain count
        toward the standings. Prize pool is split across the top 10; awards are promotional and occasional,
        announced per cycle.
      </p>
    </>
  );
}
