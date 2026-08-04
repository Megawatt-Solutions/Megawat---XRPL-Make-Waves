"use client";
// Spreadcast surfaces that live OUTSIDE the /spreadcast layout, so they cannot
// use useRound(). Each fetches /api/spreadcast/round once and renders nothing
// at all if the game API is unavailable — which happens, and must never take a
// vaults page down with it.
//
// This is where the product argument actually gets made: a BESS earns by
// buying at the day's low and selling at the day's high, so the spread IS the
// revenue. Showing yesterday's spread on a vault page is the sentence that
// turns Spreadcast from a side game into a Megawatt behaviour.

import { useEffect, useState } from "react";
import Link from "next/link";

const BAND_VARS = ["--sc-b0", "--sc-b1", "--sc-b2", "--sc-b3", "--sc-b4"];

interface Latest {
  day: string;
  spread: number;
  outcomeBand: number;
  outcomeLabel: string;
}
interface Round {
  latest: Latest | null;
  open: { closesAt?: number } | null;
}

/** Pending is distinct from failed: one reserves space, the other collapses. */
type Peek = { data: Round | null; failed: boolean };

function useRoundPeek(): Peek {
  const [data, setData] = useState<Round | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/spreadcast/round", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d && !d.error) setData(d as Round);
        else setFailed(true);
      })
      .catch(() => {
        /* game API down — these are decorative, stay silent */
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { data, failed };
}

/** One line under a vault's revenue: the number its batteries actually earn on. */
export function VaultSpreadLine() {
  const { data, failed } = useRoundPeek();
  const latest = data?.latest;

  // Unlike the strip, every word here is data, so there is nothing to paint
  // early. Hold the row's height while the fetch is in flight so the sections
  // below it do not step up once it lands.
  //
  // Reserved with the real markup rather than a min-height, because the row
  // wraps: at 390px it is two lines and 81px tall, at desktop one line and 44.
  // A guessed height is right at one width and wrong at every other, and it
  // goes stale the moment the row gains a field. Same elements, placeholder
  // text, visibility:hidden — so it wraps by exactly the same rules.
  if (!data && !failed) {
    return (
      <div className="vsl vsl-pending" aria-hidden="true">
        <span className="vsl-label">Yesterday&apos;s spread</span>
        <span className="vsl-value num">000.00</span>
        <span className="vsl-unit">€/MWh</span>
        <span className="sc-band-chip">Steady</span>
      </div>
    );
  }
  // Resolved with no result to show (between rounds, or the game is down):
  // collapse. A permanently empty row would be worse than no row.
  if (!latest) return null;

  return (
    <Link href="/spreadcast" className="vsl">
      <span className="vsl-label">Yesterday&apos;s spread</span>
      <span className="vsl-value num">{latest.spread.toFixed(2)}</span>
      <span className="vsl-unit">€/MWh</span>
      <span
        className="sc-band-chip"
        style={{ "--bc": `var(${BAND_VARS[latest.outcomeBand]})` } as React.CSSProperties}
      >
        {latest.outcomeLabel.split("·")[0].trim()}
      </span>
    </Link>
  );
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Cross-sell strip for the vaults side — the only thing the game gives back. */
export function SpreadcastStrip() {
  const { data, failed } = useRoundPeek();
  const closesAt = data?.open?.closesAt ?? null;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!closesAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  // This used to render nothing until the fetch resolved, which shoved the
  // whole home page down by 212px on mobile the moment it landed — the vault
  // cards moved out from under a thumb already reaching for one.
  //
  // It never needed to wait. The eyebrow, title and body are static strings;
  // only the countdown is data. So the strip paints immediately and the clock
  // fills in. A definitive failure still collapses it, because a game outage
  // must not take a vaults page down with it — but that is a rare path, and
  // one collapse then beats a guaranteed jump now.
  if (failed) return null;

  return (
    <Link href="/spreadcast" className="scs">
      <span className="scs-rule" aria-hidden="true" />
      <div className="scs-body">
        <div>
          <div className="scs-eyebrow">Free daily game · SI day-ahead</div>
          <div className="scs-title">Call tomorrow&apos;s spread</div>
          <p className="scs-sub">
            The same number these batteries earn on. One pick a day, no purchase, no deposit.
          </p>
        </div>
        {/* Held from first paint so the digits arriving do not resize the card.
            Between rounds there is no close time, and the slot stays empty. */}
        <div className="scs-clock" aria-hidden={now == null}>
          <span className="num">{closesAt && now != null ? countdown(closesAt - now) : " "}</span>
          <small>{closesAt ? "until entries close" : " "}</small>
        </div>
      </div>
    </Link>
  );
}
