// ─────────────────────────────────────────────────────────────
// Dashboard v2 — protocol-level overview mock data.
// Hero metrics are protocol-wide; the vault table below derives from VAULTS.
// ─────────────────────────────────────────────────────────────
import type { Vault } from "./types";
import { VAULTS } from "./vaults";

const SECONDS_PER_YEAR = 365 * 24 * 3600;

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
  // Carried so the globe tooltip can name the number it is showing. For a
  // showcase site apyBps is a gross yield on capex, not a depositor APY, and
  // without kind the tooltip had no way to tell and called every site's number
  // "APY". Status cannot stand in for this: a showcase site and an investable
  // one can both be "operational".
  kind: Vault["kind"];
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
    kind: v.kind,
    status: v.status,
    coords: BESS_COORDS[v.id],
  }));
}
