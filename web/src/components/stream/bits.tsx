"use client";
// Stream Vault demo — tiny shared pieces.
import { useEffect, useState } from "react";
import { fmtDuration, fmtMoney, fmtNum } from "@/lib/format";
import { TRANCHE_STATES } from "@/lib/stream/config";

/** dUSD (6dp bigint) → "$1,234,567.89". Demo magnitudes fit a double fine. */
export function usd6(x: bigint, decimals = 2): string {
  return fmtMoney(Number(x) / 1e6, "USD", decimals);
}

/** Vintage units (6dp bigint) → "49,275". */
export function units6(x: bigint, decimals = 0): string {
  return fmtNum(Number(x) / 1e6, decimals);
}

export function shortHash(h: string, lead = 10): string {
  if (!h || h === "0x" + "0".repeat(64)) return "—";
  return h.slice(0, lead) + "…";
}

const BADGE_CLASS = ["badge-fundraising", "badge-active", "badge-soon", "badge-soon"];

export function StateBadge({ state }: { state: number }) {
  return <span className={`badge ${BADGE_CLASS[state] ?? "badge-soon"}`}>{TRANCHE_STATES[state] ?? "?"}</span>;
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Live once-a-second countdown to a unix timestamp. Children render when done. */
export function Countdown({ until, done = "now" }: { until: number; done?: string }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = until - now;
  return <span className="num">{left > 0 ? fmtDuration(left) : done}</span>;
}

export function useNowSec(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

/** Section label row used across the demo surfaces. */
export function Kv({ k, v, title }: { k: string; v: React.ReactNode; title?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "3px 0" }} title={title}>
      <span className="muted">{k}</span>
      <span className="num" style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}
