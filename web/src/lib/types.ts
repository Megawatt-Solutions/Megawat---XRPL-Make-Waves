// ─────────────────────────────────────────────────────────────
// Domain types — shaped to mirror the eventual on-chain data so
// swapping the mock data layer for live contract reads is a clean
// drop-in. Amounts are in human-readable major units (currency amounts,
// shares, MWh); the on-chain adapter will convert from base units.
//
// Two currencies, and they are not interchangeable. ASSET-SIDE figures — a
// vault's capex, raised, annualRevenue, sinkingFundBalance — are in that
// vault's `currency`, which is EUR for all six European sites. DEPOSIT-SIDE
// figures are RLUSD, the stablecoin the protocol settles in. These comments
// used to say "USDC" throughout, which is a third thing that is neither, and
// the marketplace had shipped "Settled in USDC" to users off the back of it.
// ─────────────────────────────────────────────────────────────

export type Currency = "EUR" | "USD";

/**
 * fundraising / active = on-chain investable vaults (ERC-4626 + async redeem)
 * operational          = off-chain showcase of our real, running BESS sites
 * coming_soon          = teaser / pipeline
 */
export type VaultStatus = "fundraising" | "active" | "operational" | "coming_soon";
export type VaultKind = "onchain" | "showcase";
export type MarketMode = "charging" | "discharging" | "idle";

/** How distributed revenue is split (basis points, sum = 10000). */
export interface YieldSplit {
  depositorBps: number; // paid out to vault depositors (headline APY)
  protocolFeeBps: number; // operations & protocol treasury
  sinkingFundBps: number; // "replacement fund" — refresh batteries/gear
  reserveBps: number; // operational buffer for downtime
}

export interface BessSpec {
  powerKw: number; // 300, 3200
  energyKwh: number; // 600, 6400
  chemistry: string; // "LFP"
  hasSolar: boolean;
  solarKwp?: number;
  units: number; // battery modules (for the live grid viz)
}

/** A realistic baseline snapshot carried by each vault; the simulator
 *  animates SoC / mode / power around this and ticks counters up. */
export interface BaselineMetrics {
  socPct: number;
  healthPct: number;
  roundTripEff: number; // 0..1 (0.924)
  lifetimeCycles: number;
  chargedMwh: number; // YTD cumulative
  dischargedMwh: number;
  activations: number;
  grossYtd: number; // in vault currency
  netYtd: number;
}

export interface VaultAddresses {
  vault: string;
  receiptToken: string;
  dataStore?: string;
}

export interface Vault {
  id: string;
  kind: VaultKind;
  status: VaultStatus;
  name: string; // "BESS Metlika 01"
  shortName: string; // "Metlika 01"
  location: string; // "Metlika, Slovenia"
  country: string;
  flag: string; // emoji
  currency: Currency; // revenue / yield denomination
  symbol: string; // receipt-token symbol, e.g. "mwMET01"
  apyBps: number; // headline depositor APY
  split: YieldSplit;
  spec: BessSpec;
  metrics: BaselineMetrics;

  capex: number; // fundraising target / face value (this vault's `currency`)
  raised: number; // deposited so far (== capex when active)
  totalShares: number; // outstanding receipt-token shares
  sinkingFundBalance: number; // accumulated replacement fund

  annualRevenue: number; // expected (onchain) / actual (showcase) gross/yr
  annualRevenueRange?: [number, number];

  /** Tiny simulator-scale yield figures for the on-chain demo vault,
   *  mirroring the product screenshot (distributed / claimed). */
  yieldDistributed?: number;
  yieldClaimed?: number;

  commissioned?: string; // ISO date (operational sites)
  addresses?: VaultAddresses; // null for showcase; filled after deploy
  description: string;
  seed: number; // deterministic simulator seed
}

/** A user's position in a vault (their receipt-token holding). */
export interface Position {
  vaultId: string;
  shares: number; // receipt-token balance
  deposited: number; // principal (RLUSD)
  claimable: number; // claimable yield (vault currency)
  claimed: number; // lifetime claimed
  sharePct: number; // 0..100
  costBasis: number; // what they paid (deposit or marketplace buy)
  acquiredVia: "deposit" | "marketplace";
}

export interface MarketListing {
  id: string;
  vaultId: string;
  seller: string; // address
  shares: number;
  pricePerShare: number; // RLUSD (face = 1.00)
  listedAtDaysAgo: number;
  estApyBps: number; // effective APY to buyer at this price
}

export interface UserProfile {
  address: string; // XRPL r-address
  kycLevel: 0 | 1 | 2; // none / KYC verified / accredited
  kycIssuer?: string;
  kycIssuedAt?: string;
  xrpBalance: number; // XRP (mainnet, live account_info read)
  rlusdBalance: number; // RLUSD via trustline (0 when no trustline)
  rlusdTrustline: boolean;
  funded: boolean; // account exists on ledger (meets base reserve)
  via: "xaman" | "watch"; // xaman = ownership proven by SignIn signature
}

/** Live snapshot produced by the BESS simulator (pure fn of vault + tick). */
export interface BessSnapshot {
  t: number;
  mode: MarketMode;
  socPct: number;
  healthPct: number;
  powerKw: number; // instantaneous flow (+charge / -discharge)
  pricePerMwh: number; // current merchant price
  roundTripEff: number;
  cycles: number;
  chargedMwh: number;
  dischargedMwh: number;
  activations: number;
  grossYtd: number;
  netYtd: number;
  updatedAgoSec: number;
  units: BatteryUnit[];
}

export interface BatteryUnit {
  id: number;
  socPct: number;
  healthPct: number;
  revenue: number;
}
