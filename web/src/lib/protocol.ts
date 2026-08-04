// ─────────────────────────────────────────────────────────────
// Dashboard v2 — protocol-level overview mock data.
// Hero metrics are protocol-wide; the vault table below derives from VAULTS.
// ─────────────────────────────────────────────────────────────
import type { Currency, Vault } from "./types";
import { VAULTS, apyBpsIsGross } from "./vaults";

const SECONDS_PER_YEAR = 365 * 24 * 3600;

/**
 * The currency the physical assets are denominated in: every vault's capex,
 * raised, annualRevenue and sinkingFundBalance. All six sites are European and
 * every one of them is EUR.
 *
 * Derived from the vault data rather than written down, because the thing this
 * exists to prevent already happened: the aggregates built out of these fields
 * were formatted with a hardcoded "USD" while the rows they summed used
 * `v.currency` and rendered "€". The vault table showed rows of €240K and
 * €2.20M under a group total of $2.44M — the same two numbers added up, with
 * the other continent's symbol on the result.
 *
 * Deposits are NOT this currency. They are RLUSD, a USD stablecoin, so
 * deposit/claim/balance figures are correctly formatted as USD and must stay
 * that way. Only asset-side aggregates use this constant.
 *
 * If vaults ever span currencies, this constant becomes the wrong shape — but
 * so does every sum above it, since adding mixed currencies needs conversion
 * rather than a different symbol. That is a data decision, so it is flagged
 * here rather than guessed at.
 */
export const ASSET_CURRENCY: Currency = VAULTS[0].currency;

/** Value of the two real operational systems (Ljubljana + Metlika capex). */
export const OPERATIONAL_VALUE = VAULTS.filter((v) => v.kind === "showcase").reduce((s, v) => s + v.capex, 0);

/** Battery/gear replacement reserve accumulated across the operational sites. */
export const REPLACEMENT_FUND = VAULTS.reduce((s, v) => s + v.sinkingFundBalance, 0);

export const PROTOCOL = {
  // TVL = the operational systems (not tied to any chain). On-chain vault
  // deposits return with XRPL tokenization of the pipeline sites.
  tvl: OPERATIONAL_VALUE,
  reserves: REPLACEMENT_FUND,
  // Blended across the operational sites (12.2% / 13.4%), capital-weighted.
  stakingApyBps: 1330,
  projectedApyBps: 1350,
  pipelineApyDeltaBps: 20,
  currentlyDeployed: OPERATIONAL_VALUE,
  // Ljubljana ~2 yrs + Metlika ~11 months of revenue.
  cumulativeYield: 328_793.42,
};

/** Live accrual rate for the cumulative-yield odometer ($/sec). */
export const YIELD_RATE_PER_SEC = (PROTOCOL.tvl * (PROTOCOL.stakingApyBps / 10000)) / SECONDS_PER_YEAR;

/** Installed capacity across all BESS sites. */
export const CAPACITY = {
  mw: VAULTS.reduce((s, v) => s + v.spec.powerKw, 0) / 1000,
  mwh: VAULTS.reduce((s, v) => s + v.spec.energyKwh, 0) / 1000,
  sites: VAULTS.length,
};

// ─── deterministic series helpers ─────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export type Range = "1W" | "1M" | "3M" | "1Y" | "ALL";
const RANGE_POINTS: Record<Range, number> = { "1W": 7, "1M": 30, "3M": 45, "1Y": 52, ALL: 80 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function labelsFor(range: Range, n: number): string[] {
  if (range === "1W") return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return Array.from({ length: n }, (_, i) => {
    const m = MONTHS[Math.floor((i / n) * 11.99)];
    return i % Math.ceil(n / 6) === 0 ? m : "";
  });
}

export interface TvlSeries {
  labels: string[];
  reserves: number[];
  deployed: number[];
}

/** Stacked TVL: reserves (bottom) + deployed (top), ramping over the range. */
export function tvlSeries(range: Range): TvlSeries {
  const n = RANGE_POINTS[range];
  const r = rng(7 + range.length * 13);
  const reserves: number[] = [];
  const deployed: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // ALL/1Y show the full growth ramp; short ranges are flatter & recent.
    const base = range === "ALL" || range === "1Y" ? Math.pow(t, 0.7) : 0.82 + t * 0.18;
    const wobble = 1 + (r() - 0.5) * 0.05;
    deployed.push(Math.round(PROTOCOL.currentlyDeployed * base * wobble));
    reserves.push(Math.round(PROTOCOL.reserves * (0.6 + base * 0.4) * (1 + (r() - 0.5) * 0.06)));
  }
  return { labels: labelsFor(range, n), reserves, deployed };
}

export interface ApySeries {
  labels: string[];
  values: number[];
}

/** Staking APY history. */
export function apySeries(range: Range): ApySeries {
  const n = RANGE_POINTS[range];
  const r = rng(31 + range.length * 7);
  const cur = PROTOCOL.stakingApyBps / 100;
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const drift = 13 - t * 4; // started higher, settled
    values.push(Math.max(4, drift + Math.sin(t * 9) * 1.6 + (r() - 0.5) * 1.4));
  }
  values[n - 1] = cur;
  return { labels: labelsFor(range, n), values };
}

// ─── Vault allocation / table ─────────────────────────────────
export type AllocStatus = "active" | "operational" | "fundraising" | "coming_soon";

export interface VaultRow {
  vault: Vault;
  amount: number; // capex (deployed) or raised (pipeline)
  target: number;
  utilizationPct: number;
  apyBps: number;
  contributionBps: number; // weighted contribution to blended APY
  group: "deployed" | "pipeline";
}

function buildRows(): VaultRow[] {
  const rows: VaultRow[] = [];
  const deployedTotal = VAULTS.filter((v) => v.status === "active" || v.status === "operational").reduce((s, v) => s + v.capex, 0);
  for (const v of VAULTS) {
    const group: "deployed" | "pipeline" = v.status === "active" || v.status === "operational" ? "deployed" : "pipeline";
    const amount = group === "deployed" ? v.capex : v.raised;
    const weight = group === "deployed" && deployedTotal > 0 ? v.capex / deployedTotal : 0;
    rows.push({
      vault: v,
      amount,
      target: v.capex,
      utilizationPct: v.capex > 0 ? (amount / v.capex) * 100 : 0,
      apyBps: v.apyBps,
      contributionBps: Math.round(weight * v.apyBps),
      group,
    });
  }
  return rows;
}

export interface VaultGroupSummary {
  group: "deployed" | "pipeline";
  rows: VaultRow[];
  total: number;
  count: number;
  blendedApyBps: number;
}

export function vaultGroups(): VaultGroupSummary[] {
  const rows = buildRows();
  return (["deployed", "pipeline"] as const).map((group) => {
    const gr = rows.filter((r) => r.group === group);
    const total = gr.reduce((s, r) => s + r.amount, 0);
    const blended = total > 0 ? Math.round(gr.reduce((s, r) => s + r.apyBps * r.amount, 0) / total) : 0;
    return { group, rows: gr, total, count: gr.length, blendedApyBps: blended };
  });
}

export interface AllocSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface YieldSlice {
  key: "depositor" | "protocolFee" | "sinkingFund" | "reserve";
  label: string;
  bps: number; // capex-weighted average across the vault network
  pct: number; // share of gross yield, one decimal
  color: string;
}

/**
 * Protocol-wide yield composition, capex-weighted across every vault — where
 * each euro of gross yield actually goes.
 *
 * This was four hardcoded percentages in the dashboard (74 / 14 / 8 / 4) that
 * matched no vault in the data. Every other number on that page derives from
 * VAULTS; this one was a picture of a number. Weighted by capex to match
 * `vaultGroups()`, which blends its APY the same way.
 *
 * Derived from `split`, which is the trustworthy field. Checked against ground
 * truth — annualRevenue / capex — every vault's split sums to its actual gross
 * yield, Belgrade included (26.0% measured vs 26.5% from its split; it is a
 * denser site, not a broken row).
 *
 * `apyBps` is the field that does NOT hold a single meaning, so this function
 * deliberately does not touch it. For five of six vaults apyBps === splitSum
 * === revenue/capex, i.e. the GROSS yield. bess-belgrade-01's apyBps (1300)
 * instead equals its depositorBps, i.e. the depositor's share. One field, two
 * meanings, and types.ts calls it "headline depositor APY" — which is true of
 * exactly one vault. Flagged for the founders rather than guessed at here,
 * because every headline yield figure in the product reads from it.
 */
export function yieldComposition(): { slices: YieldSlice[]; grossBps: number; siteCount: number } {
  const totalCapex = VAULTS.reduce((s, v) => s + v.capex, 0);
  const weighted = (pick: (v: Vault) => number) =>
    totalCapex > 0 ? VAULTS.reduce((s, v) => s + pick(v) * v.capex, 0) / totalCapex : 0;

  const parts = [
    { key: "depositor", label: "Depositor yield", color: "var(--accent)", bps: weighted((v) => v.split.depositorBps) },
    { key: "protocolFee", label: "Protocol fees", color: "var(--amber)", bps: weighted((v) => v.split.protocolFeeBps) },
    { key: "sinkingFund", label: "Sinking fund", color: "var(--blue)", bps: weighted((v) => v.split.sinkingFundBps) },
    { key: "reserve", label: "Reserve buffer", color: "var(--gray)", bps: weighted((v) => v.split.reserveBps) },
  ] as const;

  const grossBps = parts.reduce((s, p) => s + p.bps, 0);
  return {
    grossBps,
    siteCount: VAULTS.length,
    slices: parts.map((p) => ({
      ...p,
      pct: grossBps > 0 ? Math.round((p.bps / grossBps) * 1000) / 10 : 0,
    })),
  };
}

/** Segments for the deployed/pipeline allocation bar. */
export function allocation(): { deployed: AllocSegment[]; pipeline: AllocSegment[]; total: number } {
  const sum = (pred: (v: Vault) => boolean, capexField: "capex" | "raised") =>
    VAULTS.filter(pred).reduce((s, v) => s + v[capexField], 0);

  const deployed: AllocSegment[] = [
    { key: "active", label: "Active vaults", value: sum((v) => v.status === "active", "capex"), color: "var(--accent)" },
    { key: "operational", label: "Operational sites", value: sum((v) => v.status === "operational", "capex"), color: "var(--blue)" },
  ];
  const pipeline: AllocSegment[] = [
    { key: "fundraising", label: "Fundraising", value: sum((v) => v.status === "fundraising", "raised"), color: "var(--amber)" },
    { key: "coming", label: "Committed pipeline", value: sum((v) => v.status === "coming_soon", "capex"), color: "var(--gray)" },
  ];
  const total = [...deployed, ...pipeline].reduce((s, x) => s + x.value, 0);
  return { deployed, pipeline, total };
}

// ─── BESS site geo-locations (for the globe) ──────────────────
const BESS_COORDS: Record<string, [number, number]> = {
  "bess-ljubljana-01": [46.0569, 14.5058],
  "bess-metlika-01": [45.6477, 15.3142],
  "bess-belgrade-01": [44.7866, 20.4489],
  "bess-leipzig-01": [51.3397, 12.3731],
  "bess-vilnius-01": [54.6872, 25.2797],
  "bess-bucharest-01": [44.4268, 26.1025],
};

export interface BessMarker {
  id: string;
  name: string;
  location: string;
  flag: string;
  capacityMw: number;
  energyMwh: number;
  apyBps: number;
  // Whether apyBps holds a gross yield or a depositor APY. This started as
  // `kind`, on the assumption that showcase sites quote gross and on-chain ones
  // quote APY — which the data does not support: BESS Leipzig 01 is on-chain
  // and its apyBps IS gross. Every other surface moved to apyBpsIsGross(); the
  // globe kept guessing from kind and so called Leipzig's gross yield "APY"
  // while its own card said "Gross yield".
  apyIsGross: boolean;
  status: Vault["status"];
  coords: [number, number]; // [lat, lng]
}

export function bessMarkers(): BessMarker[] {
  return VAULTS.filter((v) => BESS_COORDS[v.id]).map((v) => ({
    id: v.id,
    name: v.name,
    location: v.location,
    flag: v.flag,
    capacityMw: v.spec.powerKw / 1000,
    energyMwh: v.spec.energyKwh / 1000,
    apyBps: v.apyBps,
    apyIsGross: apyBpsIsGross(v),
    status: v.status,
    coords: BESS_COORDS[v.id],
  }));
}
