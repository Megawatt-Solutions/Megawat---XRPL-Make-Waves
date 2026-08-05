// ─────────────────────────────────────────────────────────────
// Prize pool — sponsored RLUSD promotional awards for the top of
// the all-time leaderboard. Entry is always free; prizes are
// marketing awards from the sponsor, never a return on a payment.
// Paid to players' XRPL wallets (an RLUSD trustline is required to
// receive).
//
// There is no season field and no season: the board is all-time,
// so a `season: "Season 1"` label promised a reset that will never
// come.
// ─────────────────────────────────────────────────────────────

export const PRIZE_POOL = {
  currency: "RLUSD",
  total: 500,
  /** Award per rank, 1st → 10th. Sums to `total`. */
  split: [125, 90, 70, 50, 40, 30, 30, 25, 20, 20],
} as const;

export function prizeForRank(rank: number): number | null {
  return PRIZE_POOL.split[rank - 1] ?? null;
}
