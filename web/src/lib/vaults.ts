// ─────────────────────────────────────────────────────────────
// Seed vault data. The two ACTIVE systems mirror our real operational
// BESS sites (Ljubljana + Metlika, off-chain showcases with live
// telemetry — not tied to any chain); the pipeline holds committed
// future sites across Europe, to be tokenized on XRPL mainnet when
// fundraising opens.
// ─────────────────────────────────────────────────────────────
import type { Vault } from "./types";

export const VAULTS: Vault[] = [
  // ─── Active #1 — Ljubljana (real, operational, off-chain) ─────
  {
    id: "bess-ljubljana-01",
    kind: "showcase",
    status: "operational",
    name: "BESS Ljubljana 01",
    shortName: "Ljubljana 01",
    location: "Ljubljana, Slovenia",
    country: "Slovenia",
    flag: "🇸🇮",
    currency: "EUR",
    symbol: "mwLJU01",
    apyBps: 1220, // gross yield on capex (showcase headline)
    split: { depositorBps: 850, protocolFeeBps: 160, sinkingFundBps: 140, reserveBps: 70 },
    spec: { powerKw: 350, energyKwh: 550, chemistry: "LFP", hasSolar: true, solarKwp: 250, units: 8 },
    metrics: {
      socPct: 64,
      healthPct: 98.9,
      roundTripEff: 0.931,
      lifetimeCycles: 705,
      chargedMwh: 361.4,
      dischargedMwh: 336.2,
      activations: 268,
      grossYtd: 15620,
      netYtd: 12950,
    },
    capex: 240000,
    raised: 240000,
    totalShares: 240000,
    sinkingFundBalance: 6790,
    annualRevenue: 29280,
    annualRevenueRange: [26000, 32000],
    commissioned: "2024-07-01",
    description:
      "Co-located 350 kW / 550 kWh battery + 250 kWp rooftop solar in Ljubljana, operating for two years. Peak-shaving and intraday arbitrage on the Slovenian market. Owned and operated by Megawatt.",
    seed: 101,
  },

  // ─── Active #2 — Metlika (real, operational, off-chain) ───────
  {
    id: "bess-metlika-01",
    kind: "showcase",
    status: "operational",
    name: "BESS Metlika 01",
    shortName: "Metlika 01",
    location: "Metlika, Slovenia",
    country: "Slovenia",
    flag: "🇸🇮",
    currency: "EUR",
    symbol: "mwMET01",
    apyBps: 1340, // gross yield on capex
    split: { depositorBps: 940, protocolFeeBps: 170, sinkingFundBps: 150, reserveBps: 80 },
    spec: { powerKw: 3200, energyKwh: 6400, chemistry: "LFP", hasSolar: false, units: 16 },
    metrics: {
      socPct: 73.5,
      healthPct: 99.4,
      roundTripEff: 0.924,
      lifetimeCycles: 328,
      chargedMwh: 1980.5,
      dischargedMwh: 1822.3,
      activations: 412,
      grossYtd: 159700,
      netYtd: 132600,
    },
    capex: 2200000,
    raised: 2200000,
    totalShares: 2200000,
    sinkingFundBalance: 30200,
    annualRevenue: 294800,
    annualRevenueRange: [270000, 315000],
    commissioned: "2025-08-01",
    description:
      "Utility-scale 3.2 MW / 6.4 MWh lithium battery in Metlika providing frequency regulation (FCR/aFRR) and wholesale arbitrage. Megawatt's flagship site, operating since last summer.",
    seed: 202,
  },

  // ─── Pipeline #1 — Belgrade 01 ────────────────────────────────
  {
    id: "bess-belgrade-01",
    kind: "onchain",
    status: "coming_soon",
    name: "BESS Belgrade 01",
    shortName: "Belgrade 01",
    location: "Belgrade, Serbia",
    country: "Serbia",
    flag: "🇷🇸",
    currency: "EUR",
    symbol: "mwBEL01",
    apyBps: 1300,
    split: { depositorBps: 1300, protocolFeeBps: 450, sinkingFundBps: 550, reserveBps: 350 },
    spec: { powerKw: 5000, energyKwh: 10000, chemistry: "LFP", hasSolar: false, units: 20 },
    metrics: {
      socPct: 0,
      healthPct: 100,
      roundTripEff: 0.93,
      lifetimeCycles: 0,
      chargedMwh: 0,
      dischargedMwh: 0,
      activations: 0,
      grossYtd: 0,
      netYtd: 0,
    },
    capex: 3200000,
    raised: 0,
    totalShares: 0,
    sinkingFundBalance: 0,
    annualRevenue: 832000,
    description:
      "Pipeline — a 5 MW / 10 MWh battery in Belgrade. Opens for fundraising next quarter.",
    seed: 707,
  },

  // ─── Pipeline #2 — Leipzig 01 ─────────────────────────────────
  {
    id: "bess-leipzig-01",
    kind: "onchain",
    status: "coming_soon",
    name: "BESS Leipzig 01",
    shortName: "Leipzig 01",
    location: "Leipzig, Germany",
    country: "Germany",
    flag: "🇩🇪",
    currency: "EUR",
    symbol: "mwLPZ01",
    apyBps: 1240,
    split: { depositorBps: 880, protocolFeeBps: 160, sinkingFundBps: 130, reserveBps: 70 },
    spec: { powerKw: 3000, energyKwh: 6000, chemistry: "LFP", hasSolar: false, units: 12 },
    metrics: {
      socPct: 0,
      healthPct: 100,
      roundTripEff: 0.93,
      lifetimeCycles: 0,
      chargedMwh: 0,
      dischargedMwh: 0,
      activations: 0,
      grossYtd: 0,
      netYtd: 0,
    },
    capex: 2100000,
    raised: 0,
    totalShares: 0,
    sinkingFundBalance: 0,
    annualRevenue: 260400,
    description:
      "Pipeline — a 3 MW / 6 MWh battery near Leipzig bidding into the German aFRR and intraday markets.",
    seed: 808,
  },

  // ─── Pipeline #3 — Vilnius 01 ─────────────────────────────────
  {
    id: "bess-vilnius-01",
    kind: "onchain",
    status: "coming_soon",
    name: "BESS Vilnius 01",
    shortName: "Vilnius 01",
    location: "Vilnius, Lithuania",
    country: "Lithuania",
    flag: "🇱🇹",
    currency: "EUR",
    symbol: "mwVLN01",
    apyBps: 1310,
    split: { depositorBps: 930, protocolFeeBps: 170, sinkingFundBps: 140, reserveBps: 70 },
    spec: { powerKw: 2000, energyKwh: 4000, chemistry: "LFP", hasSolar: false, units: 8 },
    metrics: {
      socPct: 0,
      healthPct: 100,
      roundTripEff: 0.929,
      lifetimeCycles: 0,
      chargedMwh: 0,
      dischargedMwh: 0,
      activations: 0,
      grossYtd: 0,
      netYtd: 0,
    },
    capex: 1400000,
    raised: 0,
    totalShares: 0,
    sinkingFundBalance: 0,
    annualRevenue: 183400,
    description:
      "Pipeline — a 2 MW / 4 MWh battery in Vilnius serving the Baltic FCR market after desynchronisation from the Russian grid.",
    seed: 909,
  },

  // ─── Pipeline #4 — Bucharest 01 ───────────────────────────────
  {
    id: "bess-bucharest-01",
    kind: "onchain",
    status: "coming_soon",
    name: "BESS Bucharest 01",
    shortName: "Bucharest 01",
    location: "Bucharest, Romania",
    country: "Romania",
    flag: "🇷🇴",
    currency: "EUR",
    symbol: "mwBUC01",
    apyBps: 1280,
    split: { depositorBps: 900, protocolFeeBps: 170, sinkingFundBps: 140, reserveBps: 70 },
    spec: { powerKw: 2500, energyKwh: 5000, chemistry: "LFP", hasSolar: false, units: 10 },
    metrics: {
      socPct: 0,
      healthPct: 100,
      roundTripEff: 0.93,
      lifetimeCycles: 0,
      chargedMwh: 0,
      dischargedMwh: 0,
      activations: 0,
      grossYtd: 0,
      netYtd: 0,
    },
    capex: 1700000,
    raised: 0,
    totalShares: 0,
    sinkingFundBalance: 0,
    annualRevenue: 217600,
    description:
      "Pipeline — a 2.5 MW / 5 MWh battery in Bucharest targeting Romania's fast-growing balancing market.",
    seed: 1010,
  },
];

// ─── Helpers ──────────────────────────────────────────────────

export function getVault(id: string): Vault | undefined {
  return VAULTS.find((v) => v.id === id);
}

export function vaultsByStatus(...statuses: Vault["status"][]): Vault[] {
  return VAULTS.filter((v) => statuses.includes(v.status));
}

export const investableVaults = () => VAULTS.filter((v) => v.kind === "onchain");
export const showcaseVaults = () => VAULTS.filter((v) => v.kind === "showcase");

/** Fundraising progress 0..1 */
export function raiseProgress(v: Vault): number {
  return v.capex > 0 ? Math.min(1, v.raised / v.capex) : 0;
}

/** Gross project yield (sum of the split contributions), in bps. */
export function grossYieldBps(v: Vault): number {
  const s = v.split;
  return s.depositorBps + s.protocolFeeBps + s.sinkingFundBps + s.reserveBps;
}

/**
 * Does this vault's `apyBps` hold a GROSS yield, or a depositor share?
 *
 * `apyBps` does not mean the same thing across the dataset. Five of six vaults
 * store the gross yield in it — `apyBps === grossYieldBps(v)`, and both equal
 * `annualRevenue / capex`. bess-belgrade-01 stores the depositor share instead.
 *
 * Surfaces used to guess at this from `kind`, on the assumption that showcase
 * vaults quote gross and on-chain ones quote APY. That is not what the data
 * says: BESS Leipzig 01 is on-chain and its apyBps is gross, so its card
 * labelled a gross yield "APY". Asking the numbers is exact where the guess was
 * merely usually-right.
 *
 * This deliberately reports what the field currently IS. It does not decide
 * what it SHOULD be — that changes headline figures across the product and is
 * a founder call. See the note on `apyBps` in types.ts.
 */
export function apyBpsIsGross(v: Vault): boolean {
  return v.apyBps === grossYieldBps(v);
}

export interface DashboardMetrics {
  tvl: number;
  replacementFund: number;
  vaultCount: number;
  totalMw: number;
  activeCount: number;
  fundraisingCount: number;
}

/** Aggregate dashboard metrics (mixed currencies treated 1:1 for the headline). */
export function dashboardMetrics(): DashboardMetrics {
  const tvl = VAULTS.reduce(
    (s, v) => s + (v.status === "fundraising" || v.status === "coming_soon" ? v.raised : v.capex),
    0
  );
  return {
    tvl,
    replacementFund: VAULTS.reduce((s, v) => s + v.sinkingFundBalance, 0),
    vaultCount: VAULTS.length,
    totalMw: VAULTS.reduce((s, v) => s + v.spec.powerKw, 0) / 1000,
    activeCount: VAULTS.filter((v) => v.status === "active" || v.status === "operational").length,
    fundraisingCount: VAULTS.filter((v) => v.status === "fundraising").length,
  };
}
