// ── Band engine ──────────────────────────────────────────────────
// Five spread bands. Boundaries recalibrate every Monday from trailing
// 60-day spread quintiles, so each band sits near 20% base probability and
// the edge comes from reading weather, solar and demand. Until enough
// history exists we fall back to a static table sized for the SI zone.
// Each round snapshots the boundaries it was opened with (auditability).

export const STATIC_BOUNDARIES: number[] = [45, 75, 115, 180]; // EUR/MWh

export const MIN_HISTORY_FOR_QUINTILES = 30;

/** boundaries [b1,b2,b3,b4] → bands [0,b1) [b1,b2) [b2,b3) [b3,b4) [b4,∞) */
export function bandOf(spread: number, boundaries: number[]): number {
  for (let i = 0; i < boundaries.length; i++) {
    if (spread < boundaries[i]) return i;
  }
  return boundaries.length;
}

export function bandLabel(i: number, boundaries: number[]): string {
  if (i === 0) return `< ${boundaries[0]}`;
  if (i === boundaries.length) return `≥ ${boundaries[boundaries.length - 1]}`;
  return `${boundaries[i - 1]} – ${boundaries[i]}`;
}

export const BAND_NAMES = ["Calm", "Steady", "Lively", "Swingy", "Wild"] as const;

/** Trailing-quintile recalibration. `spreads` = most recent settled spreads
 * (any order), trimmed to the trailing window by the caller. */
export function quintileBoundaries(spreads: number[]): number[] | null {
  if (spreads.length < MIN_HISTORY_FOR_QUINTILES) return null;
  const s = spreads.slice().sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = p * (s.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const v = s[lo] + (s[hi] - s[lo]) * (idx - lo);
    return Math.round(v); // whole euros - friendlier UI, negligible skew
  };
  const b = [q(0.2), q(0.4), q(0.6), q(0.8)];
  // Guard against degenerate history (identical values collapsing bands).
  for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) b[i] = b[i - 1] + 1;
  return b;
}
