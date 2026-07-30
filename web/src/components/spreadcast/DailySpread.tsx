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

function useRoundPeek() {
  const [data, setData] = useState<Round | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/spreadcast/round", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && !d.error) setData(d as Round);
      })
      .catch(() => {
        /* game API down — these are decorative, stay silent */
      });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** One line under a vault's revenue: the number its batteries actually earn on. */
export function VaultSpreadLine() {
  const data = useRoundPeek();
  const latest = data?.latest;
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
  const data = useRoundPeek();
  const closesAt = data?.open?.closesAt ?? null;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!closesAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  if (!data) return null;

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
        {closesAt && now != null && (
          <div className="scs-clock">
            <span className="num">{countdown(closesAt - now)}</span>
            <small>until entries close</small>
          </div>
        )}
      </div>
    </Link>
  );
}
