"use client";
// Public settlement archive — every delivery day auditable: published
// values → hourly means → spread → band, plus the commit-reveal record and
// weekly Merkle anchors.

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShieldIcon } from "@/components/Icons";
import { sourceLabelShort } from "./sourceLabel";
import { BAND_NAMES } from "@/lib/spreadcast/bands";

const BAND_VARS = ["--sc-b0", "--sc-b1", "--sc-b2", "--sc-b3", "--sc-b4"];

interface ArchRound {
  day: string;
  spread: number;
  outcomeBand: number;
  outcomeName: string;
  outcomeLabel: string;
  boundaries: number[];
  source: string;
  resolution: string;
  settledAt: string;
}

interface Anchor {
  week: string;
  root: string;
  leaves: number;
  txHash: string;
  simulated: boolean;
}

interface Detail {
  hourly: number[];
  values: number[];
  resolution: string;
  reveal: { user: string; verified: boolean; band: number; salt: string; hash: string; txHash: string | null; correct: boolean | null; points: number }[];
}

export function ArchiveView() {
  const [rounds, setRounds] = useState<ArchRound[] | null>(null);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Detail>>({});

  // Same gap as LeaderboardView: no .catch(), so a failed fetch left `rounds`
  // null forever and the table sat on its loading skeleton with no message and
  // no way to retry. Six shimmering placeholder rows are a promise that data is
  // coming; when the request has already died, that promise is false.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch("/api/spreadcast/archive", { cache: "no-store" })
      // Status before parse: a 500 still returns a body, so .json() resolves
      // and an error response would otherwise be read as data.
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setRounds(d.rounds ?? []);
        setAnchors(d.anchors ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setRounds(null);
    setAttempt((a) => a + 1);
  };

  const toggle = async (day: string) => {
    if (openDay === day) return setOpenDay(null);
    setOpenDay(day);
    if (!detail[day]) {
      const d = await fetch(`/api/spreadcast/archive/${day}`, { cache: "no-store" }).then((r) => r.json());
      setDetail((prev) => ({ ...prev, [day]: d }));
    }
  };

  return (
    <>
      <h1>Results</h1>
      <p className="sc-sub">
        Every round is decided by the official European electricity market prices — never by us. Click a day for
        the full price curve and everyone&apos;s revealed predictions.
      </p>

      <div className="panel sc-panel" style={{ padding: 0, overflowX: "auto", marginBottom: 20 }}>
        <table className="sc-table sc-t-results">
          <thead>
            <tr>
              <th scope="col">DELIVERY DAY</th>
              <th scope="col" className="num">SWING €/MWh</th>
              <th scope="col">BAND</th>
              <th scope="col">BOUNDARIES</th>
              <th scope="col">SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {failed ? (
              <tr>
                <td colSpan={5} style={{ padding: "22px 12px", textAlign: "center" }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Results unavailable</div>
                  <p className="sc-notice" style={{ margin: "0 auto 12px", maxWidth: 440 }}>
                    Past rounds can&apos;t be loaded right now — the rest of Megawatt is unaffected.
                  </p>
                  <button className="btn btn-ghost btn-sm" onClick={retry}>
                    Try again
                  </button>
                </td>
              </tr>
            ) : rounds == null ? (
              <>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <tr key={n} aria-hidden="true">
                    <td colSpan={5} style={{ padding: "10px 12px" }}>
                      <div className="skel skel-line" style={{ marginBottom: 0 }} />
                    </td>
                  </tr>
                ))}
              </>
            ) : (
              rounds.map((r) => (
                <RowGroup key={r.day} r={r} open={openDay === r.day} detail={detail[r.day]} onToggle={() => toggle(r.day)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Same gap as "How it works": this page had no button and no link
          either. Someone reading the settlement record is checking whether the
          game is honest — answering that and then offering nothing is a
          conversation that stops mid-sentence. Lighter framing than the how
          page, because a reference page is not a pitch. */}
      <div className="sc-next-step">
        <div>
          <div className="sc-next-step-title">Every round settles here</div>
          <p className="sc-next-step-sub">
            Yours will too — one pick a day, free, scored from the official published prices.
          </p>
        </div>
        <Link className="btn btn-accent" href="/spreadcast">
          Make a prediction
        </Link>
      </div>

      <h2>Weekly blockchain anchors</h2>
      <p className="muted" style={{ fontSize: "0.8125rem", marginBottom: 10 }}>
        Once a week, a fingerprint of every prediction and result is written to XRPL — so even email-only players
        get a tamper-proof record. {anchors.some((a) => a.simulated) && "Simulated in the prototype."}
      </p>
      {/* Column headers describe rows. With no anchors written yet this
          rendered WEEK / MERKLE ROOT / LEAVES / TX over nothing at all —
          which on a page about tamper-proof records reads as though the
          feature is broken rather than simply early. The marketplace already
          made exactly this fix for exactly this reason ("was a header row over
          nothing... an empty marketplace is the normal early state, not an
          error"), so this uses the same idiom: say what is missing, why, and
          where the record does live in the meantime. */}
      {anchors.length === 0 ? (
        <div className="panel sc-panel">
          <div className="empty-state">
            <ShieldIcon size={26} />
            <div className="empty-state-title">No weekly anchor yet</div>
            <p className="empty-state-body">
              The first fingerprint is written once a full week of rounds has settled. Until then every prediction is
              still committed and revealed daily — open any day in the table above to see the record.
            </p>
          </div>
        </div>
      ) : (
      <div className="panel sc-panel" style={{ padding: 0, overflowX: "auto" }}>
        <table className="sc-table sc-t-anchor">
          <thead>
            <tr>
              <th scope="col">WEEK</th>
              <th scope="col">MERKLE ROOT</th>
              <th scope="col" className="num">LEAVES</th>
              <th scope="col">TX</th>
            </tr>
          </thead>
          <tbody>
            {anchors.map((a) => (
              <tr key={a.week}>
                {/* sc-daycell here too. It did not show up in the audit, but it
                    is the same shape as the day cell below: a short row
                    identity sharing a class with {a.root} beside it, which is a
                    real 64-char merkle root and does want the 22ch cut. */}
                <td className="sc-mono sc-daycell">{a.week}</td>
                <td className="sc-mono muted" style={{ fontSize: "0.6875rem" }}>{a.root}</td>
                <td className="num">{a.leaves}</td>
                <td className="sc-mono muted" style={{ fontSize: "0.6875rem" }}>{a.txHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </>
  );
}

/**
 * Permalink + share for one settled day.
 *
 * Two affordances, not one. The link is the honest primitive — it can be
 * middle-clicked, bookmarked, dragged, or read before being followed, and it
 * works with no JavaScript story at all. The button is the convenience: the
 * native share sheet on a phone, clipboard on a desktop that has no sheet.
 *
 * Offering only a button would make the URL something the user has to trust
 * rather than see, which is the wrong default on a page whose whole argument
 * is that everything here is checkable.
 */
function ShareDay({ day, spread, band }: { day: string; spread: number; band: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const href = `/spreadcast/result/${day}`;

  const onShare = async () => {
    const url = `${window.location.origin}${href}`;
    const text = `Slovenia's day-ahead spread on ${day} settled at ${spread.toFixed(2)} €/MWh — ${band}.`;
    try {
      // navigator.share must be called in the click's own task or the gesture
      // is spent; do not await anything before it.
      if (navigator.share) {
        await navigator.share({ title: "Spreadcast result", text, url });
        return; // the sheet is its own confirmation
      }
      await navigator.clipboard.writeText(url);
      setSaid("Link copied");
    } catch (err) {
      // Dismissing the share sheet throws AbortError. That is the user getting
      // what they asked for, so it must not report an error — but everything
      // else must say something, or the button is simply dead and the user
      // cannot tell whether it worked. Clipboard access is refused often
      // enough (insecure origin, no permission, unfocused document) that the
      // silent version would be a real dead end.
      if ((err as { name?: string })?.name === "AbortError") return;
      setSaid("Couldn't copy — use Permalink");
    }
  };

  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), 2400);
    return () => clearTimeout(t);
  }, [said]);

  return (
    <div className="sc-share-row">
      <Link className="sc-share-link" href={href}>
        Permalink
      </Link>
      <button type="button" className="sc-share-btn" onClick={onShare}>
        Share this result
      </button>
      {/* Polite: the outcome of something the user just did, not an interruption. */}
      <span className="sr-only" role="status" aria-live="polite">
        {said ?? ""}
      </span>
      {said && (
        <span className="sc-share-said" aria-hidden="true">
          {said}
        </span>
      )}
    </div>
  );
}

function RowGroup({ r, open, detail, onToggle }: { r: ArchRound; open: boolean; detail?: Detail; onToggle: () => void }) {
  const min = detail ? Math.min(...detail.hourly) : 0;
  const max = detail ? Math.max(...detail.hourly) : 1;
  return (
    <>
      {/* The row keeps its click handler — a big pointer target is the nicer
          interaction and it costs nothing. But a <tr onClick> is not reachable
          any other way: no tabindex, no role, so the ▸ marker advertised a
          disclosure only a mouse could open, and the page's own instruction
          ("click a day for the full price curve and everyone's revealed
          predictions") was addressed to half the audience.

          Unlike the bar strips, this detail is not duplicated on the page, so
          naming the picture was not an option — it needed a real control. The
          button lives in the cell rather than on the row so the table keeps its
          semantics, and carries aria-expanded/aria-controls so the state is
          announced rather than only drawn. stopPropagation because the row
          handler would otherwise toggle a second time and cancel it out. */}
      <tr className="sc-arch-row" onClick={onToggle}>
        {/* sc-daycell: an ISO date is 10 characters and is this row's identity,
            not one of the 34-64 char opaque tokens .sc-mono's 22ch truncation
            was written for. Same carve-out as sc-bounds four rows down. */}
        <td className="sc-mono sc-daycell">
          {/* aria-controls only while the target exists. The detail row is
              rendered lazily — its content is fetched on first open — so when
              collapsed this pointed at an id that is not in the document.
              Measured: the reference resolved false closed, true open.

              A dangling aria-controls is worse than none. It promises a
              relationship the accessibility tree cannot follow, and it is
              aria-expanded that carries the state a disclosure has to announce;
              aria-controls is optional in that pattern. So it is present
              exactly when it is true. */}
          <button
            type="button"
            className="sc-arch-toggle"
            aria-expanded={open}
            aria-controls={open ? `arch-detail-${r.day}` : undefined}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <span aria-hidden="true">{open ? "▾ " : "▸ "}</span>{r.day}
          </button>
        </td>
        <td className="num" style={{ fontWeight: 700 }}>{r.spread.toFixed(2)}</td>
        <td>
          <span className="sc-band-chip" style={{ "--bc": `var(${BAND_VARS[r.outcomeBand]})` } as React.CSSProperties}>
            {r.outcomeName}
            {/* The range is dropped on phones — it is the widest part of the
                row and the band name already carries the meaning. */}
            <span className="sc-chip-range"> · {r.outcomeLabel}</span>
          </span>
        </td>
        <td className="sc-mono muted sc-bounds" style={{ fontSize: "0.6875rem" }}>{r.boundaries.join(" / ")}</td>
        <td>
          <span className="sc-tag">{sourceLabelShort(r.source)}</span>{" "}
          <span className="sc-tag">{r.resolution}</span>
        </td>
      </tr>
      {open && (
        <tr className="sc-arch-detail">
          <td colSpan={5} id={`arch-detail-${r.day}`}>
            {!detail ? (
              <span className="muted">Loading audit trail…</span>
            ) : (
              <>
                {/* 24 bars whose only description was a `title` — invisible on
                    touch and announced inconsistently. Named as a picture, same
                    as the strips elsewhere; the exact numbers stay available in
                    the row this expands from. */}
                <div
                  className="sc-hourly-grid"
                  role="img"
                  aria-label={
                    `Hourly prices, 00:00 to 23:00: ${min.toFixed(0)} to ${max.toFixed(0)} ` +
                    `euro per megawatt hour.`
                  }
                >
                  {detail.hourly.map((v, i) => {
                    const t = (v - min) / (max - min || 1);
                    return (
                      <div
                        key={i}
                        className="hr"
                        title={`${String(i).padStart(2, "0")}:00 · ${v.toFixed(2)} €/MWh`}
                        style={{
                          height: `${8 + t * 88}%`,
                          alignSelf: "flex-end",
                          background: v < 0 ? "var(--sc-b0)" : `color-mix(in srgb, var(--sc-b4) ${Math.round(t * 100)}%, var(--sc-b1))`,
                        }}
                      />
                    );
                  })}
                </div>
                <p className="muted" style={{ fontSize: "0.6875rem", margin: "4px 0 12px" }}>
                  {detail.values.length} published values ({detail.resolution}) → 24 hourly means · min{" "}
                  {min.toFixed(2)} / max {max.toFixed(2)} €/MWh
                </p>

                {/* Lives in the expanded detail rather than the row: the row is
                    already five columns and the tightest thing on this page at
                    320px. Someone who has opened a day is also the person with
                    a reason to cite it. */}
                <ShareDay day={r.day} spread={r.spread} band={r.outcomeName} />
                {/* The anchors table 200 lines up got this exact treatment, and
                    the copy I wrote for it ends "open any day in the table above
                    to see the record" — pointing at THIS table, which rendered
                    six column headers over nothing. Only the > 12 case was
                    handled; the 0 case fell through to a bare <thead>.

                    On screen it was worse than empty: the next thing under the
                    orphaned "PLAYER" header is the following archive row, so a
                    reader scanning down sees PLAYER and then "2026-08-01" and
                    reads a date as a player.

                    No call to action here, unlike the leaderboard's "lock in the
                    first one on the Play tab" — this day has already settled, so
                    there is nothing left to commit to it. */}
                {detail.reveal.length === 0 ? (
                  <p className="muted" style={{ fontSize: "0.6875rem", margin: 0 }}>
                    No predictions were committed for this day — the result above is settled from market
                    prices either way.
                  </p>
                ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="sc-table sc-t-reveal">
                    <thead>
                      <tr>
                        <th scope="col">PLAYER</th>
                        <th scope="col" className="num">BAND</th>
                        <th scope="col">COMMIT HASH</th>
                        <th scope="col">SALT (REVEALED)</th>
                        <th scope="col">COMMIT TX</th>
                        <th scope="col" className="num">PTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.reveal.slice(0, 12).map((p, i) => (
                        <tr key={i}>
                          <td>
                            {p.user} {p.verified && <span className="sc-tag v" role="img" aria-label="Verified">V</span>}
                          </td>
                          {/* The name, not the index. This column is headed BAND
                              and printed "2". Every other surface in the app
                              names them — the row above this table reads
                              "SWINGY · 176 – 244", the play view's cards are
                              Calm through Wild, the shared result page says
                              "Swingy" — so the one place showing a bare 0-4 was
                              the reveal table, whose entire purpose is letting a
                              stranger check someone's pick against the outcome.
                              A number they have to decode defeats that.

                              Name only, not bandLabel(): the range is already in
                              the row this expands from, and repeating it on
                              twelve rows would widen the tightest table here. */}
                          <td className="num" style={{ color: p.correct ? "var(--accent)" : "var(--muted)" }}>
                            {BAND_NAMES[p.band] ?? p.band}
                            {p.correct ? " ✓" : ""}
                          </td>
                          <td className="sc-mono muted" style={{ fontSize: "0.625rem" }}>{p.hash.slice(0, 20)}…</td>
                          <td className="sc-mono muted" style={{ fontSize: "0.625rem" }}>{p.salt.slice(0, 16)}…</td>
                          <td className="sc-mono muted" style={{ fontSize: "0.625rem" }}>{p.txHash ? `${p.txHash.slice(0, 18)}…` : "—"}</td>
                          <td className="num">{p.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.reveal.length > 12 && (
                    <p className="muted" style={{ fontSize: "0.6875rem", marginTop: 6 }}>
                      + {detail.reveal.length - 12} more — full record at{" "}
                      <span className="sc-mono">/api/spreadcast/archive/{r.day}</span>
                    </p>
                  )}
                </div>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
