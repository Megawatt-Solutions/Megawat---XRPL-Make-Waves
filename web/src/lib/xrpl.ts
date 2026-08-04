// ─────────────────────────────────────────────────────────────
// XRPL mainnet — the chain the protocol is built around.
// Vault receipt tokens will be issued as XRPL MPTs and deposits
// settled in RLUSD; today the app does live account reads (balance,
// RLUSD trustline) and the tokenization layer follows.
// ─────────────────────────────────────────────────────────────

/** Ripple Make Waves cohort attribution tag — MUST be set as SourceTag on
 * every transaction the platform constructs (player commits, weekly anchors,
 * prize payouts), so on-chain activity counts toward the program leaderboard. */
export const MAKE_WAVES_SOURCE_TAG = 2606190003;

export const XRPL_CHAIN = {
  network: "mainnet",
  name: "XRPL",
  sub: "Mainnet",
  /** Server-side WebSocket endpoints, first reachable wins. */
  wss: [process.env.XRPL_WSS ?? "wss://xrplcluster.com", "wss://s1.ripple.com", "wss://s2.ripple.com"],
  explorer: "https://livenet.xrpl.org",
} as const;

/** Ripple USD (RLUSD) on XRPL mainnet. */
export const RLUSD = {
  issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  /** 40-char hex currency code ("RLUSD" is longer than 3 chars). */
  currencyHex: "524C555344000000000000000000000000000000",
  symbol: "RLUSD",
} as const;

export function explorerAccount(address: string): string {
  return `${XRPL_CHAIN.explorer}/accounts/${address}`;
}

export function isXrplAddress(address: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

export interface XrplAccountSnapshot {
  address: string;
  funded: boolean;
  xrpBalance: number;
  rlusdBalance: number;
  rlusdTrustline: boolean;
  /** Absent from a real ledger read (which is by definition known). Set to
   *  false only by the offline-reconnect placeholder — see wallet.tsx. */
  balancesKnown?: boolean;
}
