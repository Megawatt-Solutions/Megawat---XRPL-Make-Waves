// ─────────────────────────────────────────────────────────────
// Site telemetry contract.
//
// A collector running on the VPS POSTs one `SiteTelemetry` payload per
// operational site to the app (planned: `POST /api/sites/:vaultId/telemetry`),
// and time-series via `GET /api/sites/:vaultId/series?range=day`. The shapes
// below ARE that contract — everything here is mocked deterministically until
// the collector ships, so swapping to live data is a drop-in.
// ─────────────────────────────────────────────────────────────
import type { Vault, Currency } from "./types";

export type FlowNodeKey = "grid" | "solar" | "battery" | "house" | "ev" | "hvac" | "other";

/** One node in the live energy-flow diagram. */
export interface FlowChannel {
  key: FlowNodeKey;
  label: string;
  /**
   * Instantaneous power in kW. Sign convention:
   *   + = power flowing TOWARD the site (sources: solar, grid import, battery discharge)
   *   − = power flowing AWAY (loads, grid export, battery charge)
   *   null = device offline / no reading ("- -")
   */
  powerKw: number | null;
  /** Optional secondary reading (battery state of charge, %). */
  soc?: number;
}

export interface SiteLive {
  timestamp: string; // ISO8601
  /** Net on-site consumption (loads + battery charging), shown in the centre. */
  housePowerKw: number;
  channels: FlowChannel[];
}

export interface SiteProduction {
  label: string; // "Solar Production" | "Energy Throughput"
  todayKwh: number;
  monthKwh: number;
  yearKwh: number;
}

export type WeatherIcon = "rain" | "cloud" | "partly" | "sun" | "snow" | "storm";
export interface SiteWeather {
  tempC: number;
  condition: string;
  location: string;
  icon: WeatherIcon;
}

export interface SiteSavings {
  currency: Currency;
  primaryLabel: string; // "Self Sufficiency" | "Revenue"
  selfSufficiencyPct: number;
  todayValue: number;
  monthValue: number;
  totalValue: number;
}

export type SeriesRange = "day" | "week" | "month" | "year";
export interface SeriesPoint {
  t: string; // axis label
  solarKw: number; // + production
  gridKw: number; // + import / − export
  consumptionKw: number; // + load (drawn below axis in the chart)
  batteryKw: number; // + charge / − discharge
  socPct: number; // 0..100
}

export interface DeviceMetric {
  label: string;
  value: number;
  unit: string; // "kWh" | "%"
  kind: "import" | "export" | "self" | "charge" | "discharge" | "soc" | "yield";
}
export interface DeviceGroup {
  key: FlowNodeKey;
  label: string;
  deviceCount: number;
  metrics: DeviceMetric[];
}

export interface SiteTelemetry {
  vaultId: string;
  live: SiteLive;
  production: SiteProduction;
  weather: SiteWeather;
  savings: SiteSavings;
  devices: DeviceGroup[];
}

// ─── deterministic helpers ────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (n: number, d = 0) => {
  const p = 10 ** d;
  return Math.round(n * p) / p;
};
/** Solar bell curve over a 0..1 day fraction (peak ~13:00). */
function solarBell(frac: number) {
  const x = (frac - 0.54) / 0.20;
  return Math.max(0, Math.exp(-x * x));
}

// A small set of plausible late-summer European conditions, indexed by the
// vault seed so each site keeps its own and it never changes between renders.
// `yield` is how much of a peak-month day this sky delivers, so the production
// card and the weather card cannot disagree. Making the weather vary by seed
// exposed that they could: Ljubljana came out Clear while its "today" sat BELOW
// its own month's daily average, which no clear day does.
const WEATHER: { tempC: number; condition: string; icon: WeatherIcon; yield: number }[] = [
  { tempC: 23, condition: "Partly Cloudy", icon: "partly", yield: 0.85 },
  { tempC: 26, condition: "Clear", icon: "sun", yield: 1.10 },
  { tempC: 19, condition: "Overcast", icon: "cloud", yield: 0.55 },
  { tempC: 21, condition: "Light Rain", icon: "rain", yield: 0.40 },
  { tempC: 28, condition: "Sunny", icon: "sun", yield: 1.15 },
];

// ─── live snapshot ────────────────────────────────────────────
export function getTelemetry(vault: Vault, t: number): SiteTelemetry {
  const r = rng(vault.seed + Math.floor(t));
  const hasSolar = vault.spec.hasSolar;
  const kw = vault.spec.powerKw; // site scale
  const wob = (base: number, amp: number) => base + (r() - 0.5) * amp;

  // Channels (sign: + toward site, − away).
  const channels: FlowChannel[] = [];
  let solarP = 0;
  if (hasSolar) {
    const solarKwp = vault.spec.solarKwp ?? kw;
    solarP = round(wob(solarKwp * 0.62, solarKwp * 0.18), 1); // midday-ish
    channels.push({ key: "solar", label: "Solar", powerKw: solarP });
  }

  const baseLoad = hasSolar ? kw * 0.12 : kw * 0.008; // house/aux load
  const otherLoad = round(wob(baseLoad, baseLoad * 0.5), 2);
  const batterySoc = round(wob(hasSolar ? 64 : 52, 8), 0);
  // Battery charges when there's surplus (solar sites midday), else discharges.
  const charging = hasSolar ? solarP > otherLoad * 1.3 : r() > 0.5;
  const batteryP = round((charging ? -1 : 1) * wob(kw * 0.45, kw * 0.2), 1);

  // Grid balances the rest (+ import / − export).
  const sources = (hasSolar ? solarP : 0) + Math.max(0, batteryP);
  const sinks = otherLoad + Math.max(0, -batteryP);
  const gridP = round(sinks - sources + wob(0, kw * 0.05), 1); // + import / − export

  channels.unshift({ key: "grid", label: "Grid", powerKw: gridP });
  channels.push({ key: "battery", label: "Battery storage", powerKw: batteryP, soc: batterySoc });
  channels.push({ key: "other", label: hasSolar ? "Other" : "Site load", powerKw: -otherLoad });
  if (hasSolar) {
    channels.push({ key: "ev", label: "EV charger", powerKw: null });
    channels.push({ key: "hvac", label: "HVAC", powerKw: r() > 0.6 ? round(-wob(kw * 0.05, kw * 0.04), 2) : null });
  }

  const housePowerKw = round(
    channels
      .filter((c) => (c.key === "other" || c.key === "ev" || c.key === "hvac" || c.key === "battery") && c.powerKw != null)
      .reduce((s, c) => s + (c.powerKw as number), 0),
    2
  );

  const ccy = vault.currency;
  const m = vault.metrics;
  const sky = WEATHER[vault.seed % WEATHER.length];
  // Solar is seasonal, so a peak month is 11% of the year. Battery throughput
  // is not — a site that cycles on price spread does it as often in February as
  // in August — so its month is a plain twelfth. The non-solar branch had
  // inherited 0.18 from the solar one and reported 328 MWh a month against a
  // stated year of 1,822: x12 = 3,936, more than twice its own year.
  const monthKwh = hasSolar ? m.chargedMwh * 1000 * 0.11 : (m.dischargedMwh * 1000) / 12;
  // One number for "a day", so the production card and the device panel cannot
  // drift apart. They already did once: the panel was aligned to a flat 1,150
  // constant, and the moment `today` started following the weather the two
  // disagreed by 28% again.
  // Wobbled HERE, once, not at each use site. Wobbling per-consumer is what
  // re-opened the gap: the card read wob(today) and the panel read today, and
  // the same quantity printed as 1,485 and 1,458 a few hundred pixels apart.
  const todayKwh = wob(
    hasSolar ? (monthKwh / 30) * sky.yield : monthKwh / 30,
    hasSolar ? 60 : 200,
  );

  return {
    vaultId: vault.id,
    live: { timestamp: new Date(0).toISOString(), housePowerKw, channels },
    production: hasSolar
      // 0.11, not 0.18. A month cannot be 18% of a year: the card showed
      // TODAY 1,187 kWh, THIS MONTH 65.1 MWh and THIS YEAR 361 MWh, where the
      // month implied 2,168 kWh/day — 1.8x its own "today", 8.7 kWh/kWp/day on
      // a 250 kWp array, and month x 12 = 781 MWh against a stated year of 361.
      // Three figures in one card, two of them contradicting the third.
      //
      // today is now the month's daily average scaled by the sky on the weather
      // card, rather than a flat 1,150. That constant was the last thing here
      // that could contradict a neighbouring card, and it did the moment the
      // weather stopped being fixed.
      ? { label: "Solar Production", todayKwh: round(todayKwh), monthKwh: round(monthKwh), yearKwh: round(m.chargedMwh * 1000) }
      : { label: "Energy Throughput", todayKwh: round(todayKwh), monthKwh: round(monthKwh), yearKwh: round(m.dischargedMwh * 1000) },
    // Keyed on the site, not on whether it has panels. Weather was chosen by
    // `hasSolar`, which is a fact about the hardware and says nothing about the
    // sky: every solar site in the book reported 23°C Partly Cloudy and every
    // other one 26°C Clear, so two towns an hour apart differed because one had
    // an array on the roof. Same false coupling the kind-decides-* lint rules
    // exist for, in a field nobody had looked at.
    //
    // vault.seed keeps it deterministic — the same site always reports the same
    // sky, server and client agree, and there is no hydration mismatch.
    weather: { tempC: sky.tempC, condition: sky.condition, icon: sky.icon, location: vault.location.split(",")[0] },
    savings: hasSolar
      // Derived from the site's own annual revenue rather than fixed constants.
      // The card ends in totalValue: netYtd, so it is describing this site's
      // earnings — and the constants had it earning 3,120/month, which is
      // 37,440 a year against an annual run-rate of 29,300 printed two cards
      // away, and 2.9x the 12,950 net YTD the same card totals to.
      ? { currency: ccy, primaryLabel: "Self Sufficiency", selfSufficiencyPct: round(wob(78, 6)), todayValue: round(wob(vault.annualRevenue / 365, vault.annualRevenue / 365 * 0.2), 2), monthValue: round(wob(vault.annualRevenue / 12, vault.annualRevenue / 12 * 0.05)), totalValue: round(m.netYtd) }
      // Same correction as the solar branch above, and it needed it just as
      // badly: todayValue was a flat 2,480 whatever the site, so Metlika showed
      // €2,477 a day — €904K a year against its own €295K run-rate, and 3.1x
      // the daily average implied by its own "This Month". monthValue was
      // already fine (23.9K x 12 = 287K against 295K), which is what made the
      // day figure stand out once the two were compared rather than read apart.
      : { currency: ccy, primaryLabel: "Revenue", selfSufficiencyPct: 96, todayValue: round(wob(vault.annualRevenue / 365, (vault.annualRevenue / 365) * 0.2)), monthValue: round(m.netYtd * 0.18), totalValue: round(m.netYtd) },
    devices: buildDevices(vault, todayKwh),
  };
}

function buildDevices(vault: Vault, todayKwh: number): DeviceGroup[] {
  const m = vault.metrics;
  const groups: DeviceGroup[] = [
    {
      key: "grid",
      label: "Grid",
      deviceCount: 1,
      metrics: [
        { label: "Import", value: round(m.chargedMwh * 0.24), unit: "kWh", kind: "import" },
        { label: "Export", value: round(m.dischargedMwh * 0.28), unit: "kWh", kind: "export" },
      ],
    },
  ];
  if (vault.spec.hasSolar) {
    groups.push({
      key: "solar",
      label: "Solar power plant",
      deviceCount: 4,
      metrics: [
        // Daily scale, like every other row in this panel. Grid shows 87 kWh
        // imported and the battery 101 kWh charged — both a day's worth — while
        // solar showed 3,217 kWh with no period stated: about three days of
        // output, sitting 2.7x above the "TODAY 1,187 kWh" on the same screen.
        // 0.0032 lands on ~1,156 kWh, matching that card, and self-used at
        // 0.0024 gives ~75%, matching the "Self Sufficiency 76%" beside it.
        { label: "Produced", value: round(todayKwh, 1), unit: "kWh", kind: "yield" },
        { label: "Self-used", value: round(todayKwh * 0.75, 1), unit: "kWh", kind: "self" },
        // "Inverter 100%" sat between two readings and committed to neither:
        // beside two kWh throughput rows it reads as efficiency, and no
        // inverter is 100% efficient — real ones run 96-98%. The panel means
        // the unit is up, so the label now says so and the number stops being
        // a physical claim.
        { label: "Inverter uptime", value: 100, unit: "%", kind: "soc" },
      ],
    });
  }
  groups.push({
    key: "battery",
    label: "Battery",
    deviceCount: 1,
    metrics: [
      // The SAME factor for both, so the ratio survives. 0.28 and 0.24 gave
      // 101 kWh charged against 81 discharged — an 80.2% round trip — while the
      // State of charge card on the same page prints "93.1% Round-trip
      // efficiency". The underlying metrics already agree with that card:
      // 336.20 / 361.40 = 93.0%. Two different scale factors broke a ratio that
      // was correct in the data before it was displayed.
      { label: "Charged", value: round(m.chargedMwh * 0.28), unit: "kWh", kind: "charge" },
      { label: "Discharged", value: round(m.dischargedMwh * 0.28), unit: "kWh", kind: "discharge" },
      { label: "State of charge", value: round(m.socPct), unit: "%", kind: "soc" },
    ],
  });
  groups.push({
    key: "other",
    label: vault.spec.hasSolar ? "Other" : "Site load",
    deviceCount: 1,
    metrics: [{ label: "Consumed", value: round(m.dischargedMwh * 0.7), unit: "kWh", kind: "self" }],
  });
  return groups;
}

// ─── time-series ──────────────────────────────────────────────
const RANGE_POINTS: Record<SeriesRange, number> = { day: 96, week: 56, month: 60, year: 48 };

export function getSeries(vault: Vault, range: SeriesRange): SeriesPoint[] {
  const n = RANGE_POINTS[range];
  const r = rng(vault.seed * 31 + range.length);
  const hasSolar = vault.spec.hasSolar;
  const kw = vault.spec.powerKw;
  // Solar is sized by the ARRAY, not the inverter. snapshot() above already
  // does this — `const solarKwp = vault.spec.solarKwp ?? kw` — and this
  // generator did not, so the two disagreed about how big a solar plant is.
  //
  // Visible on Ljubljana, a 350 kW site with a 250 kWp array: the chart scaled
  // solar by powerKw, peaking at 350 * 0.92 * 1.15 ≈ 370 kW — half again the
  // array's nameplate, on the same page that prints "LFP + 250 kWp solar" three
  // cards above. At 250 the peak lands near 264 kW, about 106% of nameplate,
  // which is what a real array does on a bright edge-of-cloud day.
  const solarKw = vault.spec.solarKwp ?? kw;
  const out: SeriesPoint[] = [];
  let soc = hasSolar ? 40 : 55;

  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1);
    const noise = (r() - 0.5) * 2;

    const solar = hasSolar ? round(Math.max(0, solarBell(frac) * solarKw * 0.92 * (0.85 + r() * 0.3)), 1) : 0;
    const baseCons = (hasSolar ? kw * 0.13 : kw * 0.01) * (0.7 + 0.6 * Math.abs(Math.sin(frac * Math.PI * 2)));
    const consumption = round(baseCons + Math.max(0, noise) * kw * 0.02, 2);

    // Battery: charge on surplus, discharge in evening peak.
    const surplus = solar - consumption;
    let battery: number;
    if (hasSolar) battery = surplus > 0 ? -Math.min(surplus * 0.8, kw * 0.9) : (frac > 0.7 ? Math.min(kw * 0.5, soc) : 0);
    else battery = frac < 0.3 ? -kw * 0.7 : frac > 0.55 && frac < 0.85 ? kw * 0.85 : 0; // night charge / evening discharge
    battery = round(battery + noise * kw * 0.03, 1);

    soc = Math.max(8, Math.min(100, soc - battery / (vault.spec.energyKwh / 1000) / (n / 24) * 0.6));
    const grid = round(consumption + Math.max(0, battery) - solar - Math.max(0, -battery), 1);

    const label =
      range === "day" ? `${String(Math.floor((i / n) * 24)).padStart(2, "0")}:00`
      : range === "week" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.floor(frac * 6.99)]
      : range === "month" ? `${Math.floor(frac * 29) + 1}`
      : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Math.floor(frac * 11.99)];

    out.push({ t: label, solarKw: solar, gridKw: grid, consumptionKw: consumption, batteryKw: battery, socPct: round(soc) });
  }
  return out;
}
