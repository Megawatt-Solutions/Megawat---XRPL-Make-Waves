"use client";
// Public settlement archive — every delivery day auditable: published
// values → hourly means → spread → band, plus the commit-reveal record and
// weekly Merkle anchors.

import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/spreadcast/archive", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRounds(d.rounds);
        setAnchors(d.anchors);
      });
  }, []);

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
            {rounds == null ? (
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

      <h2>Weekly blockchain anchors</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Once a week, a fingerprint of every prediction and result is written to XRPL — so even email-only players
        get a tamper-proof record. {anchors.some((a) => a.simulated) && "Simulated in the prototype."}
      </p>
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
                <td className="sc-mono">{a.week}</td>
                <td className="sc-mono muted" style={{ fontSize: 11 }}>{a.root}</td>
                <td className="num">{a.leaves}</td>
                <td className="sc-mono muted" style={{ fontSize: 11 }}>{a.txHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RowGroup({ r, open, detail, onToggle }: { r: ArchRound; open: boolean; detail?: Detail; onToggle: () => void }) {
  const min = detail ? Math.min(...detail.hourly) : 0;
  const max = detail ? Math.max(...detail.hourly) : 1;
  return (
    <>
      <tr className="sc-arch-row" onClick={onToggle}>
        <td className="sc-mono">{open ? "▾ " : "▸ "}{r.day}</td>
        <td className="num" style={{ fontWeight: 700 }}>{r.spread.toFixed(2)}</td>
        <td>
          <span className="sc-band-chip" style={{ "--bc": `var(${BAND_VARS[r.outcomeBand]})` } as React.CSSProperties}>
            {r.outcomeName}
            {/* The range is dropped on phones — it is the widest part of the
                row and the band name already carries the meaning. */}
            <span className="sc-chip-range"> · {r.outcomeLabel}</span>
          </span>
        </td>
        <td className="sc-mono muted" style={{ fontSize: 11 }}>{r.boundaries.join(" / ")}</td>
        <td>
          <span className="sc-tag">{r.source === "entsoe" ? "ENTSO-E A44" : "SIMULATED"}</span>{" "}
          <span className="sc-tag">{r.resolution}</span>
        </td>
      </tr>
      {open && (
        <tr className="sc-arch-detail">
          <td colSpan={5}>
            {!detail ? (
              <span className="muted">Loading audit trail…</span>
            ) : (
              <>
                <div className="sc-hourly-grid">
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
                <p className="muted" style={{ fontSize: 11, margin: "4px 0 12px" }}>
                  {detail.values.length} published values ({detail.resolution}) → 24 hourly means · min{" "}
                  {min.toFixed(2)} / max {max.toFixed(2)} €/MWh
                </p>
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
                            {p.user} {p.verified && <span className="sc-tag v">V</span>}
                          </td>
                          <td className="num" style={{ color: p.correct ? "var(--accent)" : "var(--muted)" }}>
                            {p.band}
                            {p.correct ? " ✓" : ""}
                          </td>
                          <td className="sc-mono muted" style={{ fontSize: 10 }}>{p.hash.slice(0, 20)}…</td>
                          <td className="sc-mono muted" style={{ fontSize: 10 }}>{p.salt.slice(0, 16)}…</td>
                          <td className="sc-mono muted" style={{ fontSize: 10 }}>{p.txHash ? `${p.txHash.slice(0, 18)}…` : "—"}</td>
                          <td className="num">{p.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.reveal.length > 12 && (
                    <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      + {detail.reveal.length - 12} more — full record at{" "}
                      <span className="sc-mono">/api/spreadcast/archive/{r.day}</span>
                    </p>
                  )}
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
