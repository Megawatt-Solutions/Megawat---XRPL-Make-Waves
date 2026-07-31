import type { Currency } from "./types";

export const CCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$" };

const moneyFmt = (currency: Currency, min = 2, max = 2) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

/** "$2,200,000.00" / "€49.65" */
export function fmtMoney(n: number, currency: Currency = "USD", decimals = 2): string {
  return moneyFmt(currency, decimals, decimals).format(n);
}

/** Compact: "$2.5M", "€240K", "$1.8M" */
export function fmtCompact(n: number, currency: Currency = "USD"): string {
  const sym = CCY_SYMBOL[currency];
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sym}${(n / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return `${sym}${n.toFixed(0)}`;
}

/** Plain number with grouping. */
export function fmtNum(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function bpsToPct(bps: number): number {
  return bps / 100;
}

/** Power in kW → "3.2 MW" / "300 kW" */
export function fmtPower(kw: number): string {
  return kw >= 1000 ? `${(kw / 1000).toFixed(kw % 1000 === 0 ? 0 : 1)} MW` : `${kw} kW`;
}

/** Energy in kWh → "6.4 MWh" / "600 kWh" */
export function fmtEnergy(kwh: number): string {
  return kwh >= 1000 ? `${(kwh / 1000).toFixed(kwh % 1000 === 0 ? 0 : 1)} MWh` : `${kwh} kWh`;
}

/** "0x30cA...1a76" */
export function fmtAddress(addr: string, lead = 6, tail = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, lead)}...${addr.slice(-tail)}`;
}

/** "4d 12h" style relative duration from seconds. */
export function fmtDuration(totalSec: number): string {
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtAgo(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/** A count with its noun agreeing: "1 position", "2 positions", "0 positions".
 *
 *  English pluralises on n !== 1, so zero takes the plural — "0 positions" is
 *  right and "0 position" is not. Added after the portfolio tile read
 *  "1 positions"; that only showed up once a fixture put a single position in,
 *  which is the general hazard with count strings — the empty and the many
 *  cases both look fine and the one case is the one nobody sees. */
export function plural(n: number, one: string, many = one + "s"): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}
