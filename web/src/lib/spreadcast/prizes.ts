// ─────────────────────────────────────────────────────────────
// Season prize pool — sponsored RLUSD promotional awards for the
// top of the season leaderboard. Entry is always free; prizes are
// marketing awards from the sponsor, never a return on a payment.
// Paid weekly/at season end to players' XRPL wallets (an RLUSD
// trustline is required to receive).
// ─────────────────────────────────────────────────────────────

export const PRIZE_POOL = {
  season: "Season 1",
  currency: "RLUSD",
  total: 500,
  /** Award per rank, 1st → 10th. Sums to `total`. */
  split: [125, 90, 70, 50, 40, 30, 30, 25, 20, 20],
} as const;

export function prizeForRank(rank: number): number | null {
  return PRIZE_POOL.split[rank - 1] ?? null;
}
