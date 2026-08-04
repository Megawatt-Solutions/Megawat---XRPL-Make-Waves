// ─────────────────────────────────────────────────────────────
// Spreadcast worker — the always-on backend for the forecasting game.
//   • market clock (Europe/Ljubljana): open 15:00 D-2, close 11:45 D-1,
//     results poll ~13:00, settle 15:00, Monday band recalibration,
//     Sunday weekly Merkle anchor
//   • price source: ENTSO-E A44 (SI zone) when ENTSOE_TOKEN is set,
//     deterministic simulator fallback (rows are tagged by source)
//   • XRPL mainnet listener: subscribes to the anchor account and mirrors
//     every observed tx into chain_txs; matches spreadcast/commit memos to
//     predictions (the ledger — not the client — proves commits)
//   • health endpoint on 127.0.0.1:8787
// Logic mirrors web/src/lib/spreadcast/* — keep the two in sync.
// ─────────────────────────────────────────────────────────────
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import cron from "node-cron";
import pg from "pg";

const TZ = "Europe/Ljubljana";
const XRPL_WSS = process.env.XRPL_WSS || "wss://xrplcluster.com";
const ANCHOR_ADDRESS = process.env.XRPL_ANCHOR_ADDRESS || "";
const ANCHOR_SEED = process.env.XRPL_ANCHOR_SEED || "";
// Xaman-style secret numbers (8 groups of 6 digits, space-separated) as an
// alternative to a family seed — whichever is set on the server wins.
const ANCHOR_SECRET_NUMBERS = (process.env.XRPL_ANCHOR_SECRET_NUMBERS || "").trim();

async function anchorWallet() {
  const { Wallet } = await import("xrpl");
  if (ANCHOR_SEED) return Wallet.fromSeed(ANCHOR_SEED);
  if (ANCHOR_SECRET_NUMBERS) return Wallet.fromSecretNumbers(ANCHOR_SECRET_NUMBERS.split(/[\s,]+/));
  return null;
}
const ENTSOE_TOKEN = process.env.ENTSOE_TOKEN || "";
const SI_EIC = "10YSI-ELES-----O";
// Ripple Make Waves attribution — SourceTag on every platform-built tx.
const MAKE_WAVES_SOURCE_TAG = 2606190003;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = (text, params) => pool.query(text, params);

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function jobRun(job, fn) {
  try {
    const detail = (await fn()) ?? "";
    await q("insert into job_runs (job, ok, detail) values ($1, true, $2)", [job, String(detail).slice(0, 500)]);
    log(`job ${job}: ok`, detail);
  } catch (e) {
    await q("insert into job_runs (job, ok, detail) values ($1, false, $2)", [job, String(e?.message ?? e).slice(0, 500)]).catch(() => {});
    log(`job ${job}: FAILED`, e);
  }
}

// ─── market clock (port of web/src/lib/spreadcast/time.ts) ────
const dtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
function localTime(date = new Date()) {
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const hh = Number(p.hour === "24" ? "0" : p.hour);
  return { day: `${p.year}-${p.month}-${p.day}`, hh, mm: Number(p.minute), minutes: hh * 60 + Number(p.minute) };
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const CLOSE_MIN = 11 * 60 + 45, OPEN_MIN = 15 * 60;
function localMomentUtc(day, minutes) {
  const [y, m, d] = day.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  for (let i = 0; i < 2; i++) {
    const lt = localTime(new Date(guess));
    const got = lt.minutes + (lt.day === day ? 0 : lt.day > day ? 1440 : -1440);
    guess -= (got - minutes) * 60000;
  }
  return new Date(guess);
}
function isMonday(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}
function isoWeek(day) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return `${date.getUTCFullYear()}-W${String(Math.ceil(((date - yearStart) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}

// ─── bands & scoring (port of bands.ts / scoring.ts) ──────────
function bandOf(spread, b) {
  for (let i = 0; i < b.length; i++) if (spread < b[i]) return i;
  return b.length;
}
function quintileBoundaries(spreads) {
  if (spreads.length < 30) return null;
  const s = spreads.slice().sort((a, b) => a - b);
  const quant = (p) => {
    const idx = p * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return Math.round(s[lo] + (s[hi] - s[lo]) * (idx - lo));
  };
  const b = [quant(0.2), quant(0.4), quant(0.6), quant(0.8)];
  for (let i = 1; i < b.length; i++) if (b[i] <= b[i - 1]) b[i] = b[i - 1] + 1;
  return b;
}
const multiplierFor = (streak) => (streak <= 1 ? 1 : Math.min(1 + 0.5 * (streak - 1), 3));
const pointsFor = (streak) => Math.round(10 * multiplierFor(streak));

// ─── prices (port of prices.ts) ───────────────────────────────
function toHourlyMeans(values) {
  if (values.length === 24) return values.slice();
  const per = values.length / 24, out = [];
  for (let h = 0; h < 24; h++) {
    const seg = values.slice(Math.round(h * per), Math.max(Math.round((h + 1) * per), Math.round(h * per) + 1));
    out.push(seg.reduce((a, b) => a + b, 0) / seg.length);
  }
  return out;
}
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function simulateDay(day) {
  let h = 2166136261;
  for (const c of day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = mulberry32(h >>> 0);
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const winter = Math.cos(((m - 0.5) / 12) * 2 * Math.PI);
  const base = 78 + winter * 18 + (rnd() - 0.5) * 30 - (weekend ? 14 : 0);
  const sunny = Math.max(0, Math.min(1, 0.35 - winter * 0.3 + (rnd() - 0.35) * 0.9));
  const tight = rnd() < 0.12, vol = 6 + rnd() * 10;
  const values = [];
  for (let qtr = 0; qtr < 96; qtr++) {
    const hr = qtr / 4;
    let p = base;
    p += 24 * Math.exp(-((hr - 8.2) ** 2) / 4);
    p += (tight ? 95 : 34) * Math.exp(-((hr - 19.6) ** 2) / 3.2);
    p -= 26 * Math.exp(-((hr - 3.5) ** 2) / 9);
    p -= sunny * (weekend ? 105 : 82) * Math.exp(-((hr - 12.8) ** 2) / 7);
    p += (rnd() - 0.5) * vol;
    values.push(Math.round(p * 100) / 100);
  }
  return { source: "simulated", resolution: "PT15M", values, hourly: toHourlyMeans(values) };
}
async function fetchEntsoeDay(day) {
  if (!ENTSOE_TOKEN) return null;
  const compact = day.replaceAll("-", "");
  const url = `https://web-api.tp.entsoe.eu/api?securityToken=${ENTSOE_TOKEN}` +
    `&documentType=A44&in_Domain=${SI_EIC}&out_Domain=${SI_EIC}` +
    `&periodStart=${compact}0000&periodEnd=${compact}2300`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const xml = await res.text();
  if (xml.includes("<Acknowledgement_MarketDocument")) return null;
  const series = [];
  const periodRe = /<Period>([\s\S]*?)<\/Period>/g;
  let pm;
  while ((pm = periodRe.exec(xml))) {
    const block = pm[1];
    const resolution = /<resolution>(.*?)<\/resolution>/.exec(block)?.[1] ?? "PT60M";
    const points = new Map();
    const pointRe = /<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<price\.amount>(-?[\d.]+)<\/price\.amount>[\s\S]*?<\/Point>/g;
    let m;
    while ((m = pointRe.exec(block))) points.set(Number(m[1]), Number(m[2]));
    series.push({ resolution, points });
  }
  if (!series.length) return null;
  const best = series.reduce((a, b) => (b.points.size > a.points.size ? b : a));
  const quarter = best.resolution === "PT15M";
  const slots = quarter ? 96 : 24;
  const values = [];
  let last = 0;
  for (let i = 1; i <= slots; i++) {
    if (best.points.has(i)) last = best.points.get(i);
    values.push(last);
  }
  return { source: "entsoe", resolution: quarter ? "PT15M" : "PT60M", values, hourly: toHourlyMeans(values) };
}

/** Real prices for one delivery day from Energy-Charts (ENTSO-E mirror,
 * no key). Used as settlement fallback until ENTSOE_TOKEN is configured. */
async function fetchEnergyChartsDay(day) {
  const res = await fetch(`https://api.energy-charts.info/price?bzn=SI&start=${day}&end=${day}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const ts = data.unix_seconds ?? [];
  const prices = data.price ?? [];
  const byHour = new Map();
  const values = [];
  for (let i = 0; i < ts.length; i++) {
    if (prices[i] == null) continue;
    const lt = localTime(new Date(ts[i] * 1000));
    if (lt.day !== day) continue;
    values.push(Number(prices[i]));
    if (!byHour.has(lt.hh)) byHour.set(lt.hh, []);
    byHour.get(lt.hh).push(Number(prices[i]));
  }
  if (byHour.size < 20) return null; // not published yet / partial
  const hourly = [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([, a]) => a.reduce((x, y) => x + y, 0) / a.length);
  return { source: "energy-charts", resolution: values.length >= 90 ? "PT15M" : "PT60M", values, hourly };
}

// ─── merkle (port of merkle.ts) ───────────────────────────────
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
function merkleRoot(leaves) {
  if (!leaves.length) return sha256("empty");
  let level = leaves.map((l) => l.toLowerCase()).sort();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    level = next;
  }
  return level[0];
}

// ─── round lifecycle ──────────────────────────────────────────
async function currentBoundaries() {
  const r = await q("select value from meta where key = 'boundaries'");
  return r.rows[0].value.map(Number);
}

async function recalibrateIfDue(openDay) {
  if (!isMonday(openDay)) return "not monday";
  const last = await q("select value from meta where key = 'lastRecalc'");
  if (last.rows[0]?.value === openDay) return "already done";
  const r = await q(
    `select spread from rounds where status = 'settled' and source != 'simulated'
       and delivery_day < $1 and delivery_day >= $2
     order by delivery_day desc limit 60`,
    [openDay, addDays(openDay, -60)]
  );
  let samples = r.rows.map((x) => Number(x.spread));
  if (samples.length < 30) {
    // Not enough real settled rounds yet — calibrate from real market history.
    const h = await q("select swing from price_history where day < $1 and day >= $2", [openDay, addDays(openDay, -60)]);
    samples = samples.concat(h.rows.map((x) => Number(x.swing))).slice(0, 60);
  }
  const b = quintileBoundaries(samples);
  if (!b) return `history ${r.rows.length} < 30, keeping boundaries`;
  await q("insert into meta (key, value) values ('boundaries', $1::jsonb) on conflict (key) do update set value = $1::jsonb", [JSON.stringify(b)]);
  await q("insert into meta (key, value) values ('lastRecalc', $1::jsonb) on conflict (key) do update set value = $1::jsonb", [JSON.stringify(openDay)]);
  return `recalibrated to ${b.join("/")}`;
}

/** Make sure the round currently open for predictions exists. */
async function ensureOpenRound() {
  const now = localTime();
  const openDay = now.minutes < CLOSE_MIN ? addDays(now.day, 1) : addDays(now.day, 2);
  const exists = await q("select 1 from rounds where delivery_day = $1", [openDay]);
  if (exists.rowCount) return `round ${openDay} exists`;
  await recalibrateIfDue(openDay);
  const b = await currentBoundaries();
  await q(
    "insert into rounds (delivery_day, opens_at, closes_at, boundaries, status) values ($1, $2, $3, $4, 'open')",
    [openDay, localMomentUtc(addDays(openDay, -2), OPEN_MIN), localMomentUtc(addDays(openDay, -1), CLOSE_MIN), b]
  );
  return `opened ${openDay} bands ${b.join("/")}`;
}

async function closeDueRounds() {
  const r = await q("update rounds set status = 'closed' where status = 'open' and closes_at <= now() returning delivery_day");
  return `closed ${r.rows.map((x) => x.delivery_day.toISOString?.().slice(0, 10) ?? x.delivery_day).join(", ") || "nothing"}`;
}

/** Store published prices for a delivery day (no settlement yet). */
async function pollPrices() {
  const now = localTime();
  const day = addDays(now.day, 1); // auction today is for tomorrow's delivery
  const round = await q("select status, source from rounds where delivery_day = $1", [day]);
  if (!round.rowCount) return `no round for ${day}`;
  if (round.rows[0].source === "entsoe") return `already have entsoe prices for ${day}`;
  const prices = (await fetchEntsoeDay(day)) ?? (await fetchEnergyChartsDay(day).catch(() => null));
  if (!prices) return `no prices available yet for ${day} (entsoe token ${ENTSOE_TOKEN ? "set" : "missing"})`;
  await q("update rounds set source = $2, resolution = $3, raw_values = $4, hourly = $5 where delivery_day = $1",
    [day, prices.source, prices.resolution, prices.values, prices.hourly.map((v) => Math.round(v * 100) / 100)]);
  return `stored entsoe prices for ${day}`;
}

/** Streak carried into `day` for a player (consecutive correct preceding days). */
async function previousStreak(playerId, day) {
  let streak = 0, cursor = addDays(day, -1);
  for (;;) {
    const r = await q("select correct from predictions where delivery_day = $1 and player_id = $2", [cursor, playerId]);
    if (!r.rowCount || !r.rows[0].correct) return streak;
    streak++;
    cursor = addDays(cursor, -1);
  }
}

async function settleDueRounds() {
  const due = await q(
    `select delivery_day, boundaries, source, hourly from rounds
     where status != 'settled' and closes_at <= now() - interval '3 hours' order by delivery_day`
  );
  if (!due.rowCount) return "nothing due";
  const done = [];
  for (const row of due.rows) {
    const day = day10(row.delivery_day);
    let prices = row.source === "entsoe"
      ? { source: "entsoe", hourly: row.hourly.map(Number) }
      : (await fetchEntsoeDay(day).catch(() => null)) ??
        (await fetchEnergyChartsDay(day).catch(() => null)) ??
        simulateDay(day);
    const hourly = prices.hourly.map((v) => Math.round(v * 100) / 100);
    const spread = Math.round((Math.max(...hourly) - Math.min(...hourly)) * 100) / 100;
    const outcome = bandOf(spread, row.boundaries.map(Number));
    await q(
      `update rounds set status = 'settled', settled_at = now(), source = coalesce(source, $2),
       resolution = coalesce(resolution, $3), raw_values = coalesce(raw_values, $4),
       hourly = $5, spread = $6, outcome_band = $7 where delivery_day = $1`,
      [day, prices.source, prices.resolution ?? null, prices.values ?? null, hourly, spread, outcome]
    );
    // Score only picks whose commit was observed on-chain — an unsigned pick
    // earns nothing and (correct stays null) breaks any streak through it.
    const preds = await q(
      `select player_id, band, exact_guess from predictions
       where delivery_day = $1 and tx_hash is not null and tx_hash not like 'SIMULATED-%'`,
      [day]
    );
    for (const p of preds.rows) {
      const correct = p.band === outcome;
      const streak = correct ? (await previousStreak(p.player_id, day)) + 1 : 0;
      await q(
        `update predictions set correct = $3, streak = $4, multiplier = $5, points = $6, abs_error = $7
         where delivery_day = $1 and player_id = $2`,
        [day, p.player_id, correct, streak, correct ? multiplierFor(streak) : 0, correct ? pointsFor(streak) : 0,
         p.exact_guess == null ? null : Math.round(Math.abs(Number(p.exact_guess) - spread) * 100) / 100]
      );
    }
    done.push(`${day}→band${outcome} (${spread}, ${prices.source}, ${preds.rowCount} preds)`);
  }
  await ensureOpenRound();
  return done.join("; ");
}

// ─── historical swing data (player context, display-only) ─────
// Real SI day-ahead prices from Energy-Charts (Fraunhofer ISE, ENTSO-E
// data, CC BY 4.0, no API key). Settlement stays on the official
// ENTSO-E/simulator path — this table only powers the "recent swings"
// helper on the Play tab.
async function refreshPriceHistory() {
  await q(`create table if not exists price_history (
    day date primary key,
    swing numeric not null,
    source text not null default 'energy-charts',
    fetched_at timestamptz not null default now()
  )`);
  const now = localTime();
  const start = addDays(now.day, -35);
  const res = await fetch(`https://api.energy-charts.info/price?bzn=SI&start=${start}&end=${now.day}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`energy-charts http ${res.status}`);
  const data = await res.json();
  const ts = data.unix_seconds ?? [];
  const prices = data.price ?? [];
  const dayHours = new Map(); // local day -> hour -> [prices]
  for (let i = 0; i < ts.length; i++) {
    if (prices[i] == null) continue;
    const lt = localTime(new Date(ts[i] * 1000));
    if (!dayHours.has(lt.day)) dayHours.set(lt.day, new Map());
    const hm = dayHours.get(lt.day);
    if (!hm.has(lt.hh)) hm.set(lt.hh, []);
    hm.get(lt.hh).push(Number(prices[i]));
  }
  let n = 0;
  for (const [day, hm] of dayHours) {
    if (day >= now.day || hm.size < 20) continue; // completed days only
    const hourly = [...hm.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
    const swing = Math.round((Math.max(...hourly) - Math.min(...hourly)) * 100) / 100;
    await q(
      "insert into price_history (day, swing) values ($1, $2) on conflict (day) do update set swing = $2, fetched_at = now()",
      [day, swing]
    );
    n++;
  }
  return `stored ${n} days`;
}

// ─── weekly anchor ────────────────────────────────────────────
async function weeklyAnchor() {
  const lastWeek = isoWeek(addDays(localTime().day, -7));
  const existing = await q("select 1 from anchors where week = $1", [lastWeek]);
  if (existing.rowCount) return `anchor ${lastWeek} exists`;
  const hashes = await q(
    `select p.commit_hash from predictions p join rounds r on r.delivery_day = p.delivery_day
     where r.status = 'settled' and to_char(p.delivery_day, 'IYYY-"W"IW') = $1`,
    [lastWeek]
  );
  if (!hashes.rowCount) return `no settled predictions in ${lastWeek}`;
  const root = merkleRoot(hashes.rows.map((r) => r.commit_hash));
  let txHash = `SIMULATED-${root.slice(0, 16).toUpperCase()}`;
  let simulated = true;
  const wallet = await anchorWallet();
  if (wallet) {
    const { Client } = await import("xrpl");
    const client = new Client(XRPL_WSS);
    await client.connect();
    try {
      const hex = (s) => Buffer.from(s, "utf8").toString("hex").toUpperCase();
      const res = await client.submitAndWait({
        TransactionType: "Payment", Account: wallet.address, Destination: wallet.address, Amount: "1",
        SourceTag: MAKE_WAVES_SOURCE_TAG,
        Memos: [{ Memo: { MemoType: hex("spreadcast/anchor"), MemoFormat: hex("text/plain"), MemoData: hex(`${lastWeek}:${root}`) } }],
      }, { autofill: true, wallet });
      txHash = res.result.hash;
      simulated = false;
    } finally {
      await client.disconnect();
    }
  }
  await q("insert into anchors (week, merkle_root, leaves, tx_hash, simulated) values ($1, $2, $3, $4, $5)",
    [lastWeek, root, hashes.rowCount, txHash, simulated]);
  return `anchored ${lastWeek} root ${root.slice(0, 12)}… (${simulated ? "simulated" : txHash})`;
}

// ─── XRPL anchor-account listener ─────────────────────────────
const hexToUtf8 = (h) => { try { return Buffer.from(h, "hex").toString("utf8"); } catch { return null; } };

async function recordChainTx(tx, ledgerIndex) {
  const memo = tx.Memos?.[0]?.Memo;
  const memoType = memo?.MemoType ? hexToUtf8(memo.MemoType) : null;
  const memoData = memo?.MemoData ? hexToUtf8(memo.MemoData) : null;
  let deliveryDay = null;
  if (memoType === "spreadcast/commit" && memoData?.match(/^\d{4}-\d{2}-\d{2}:/)) deliveryDay = memoData.slice(0, 10);
  await q(
    `insert into chain_txs (tx_hash, account, tx_type, memo_type, memo_data, delivery_day, ledger_index)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (tx_hash) do nothing`,
    [tx.hash, tx.Account, tx.TransactionType, memoType, memoData, deliveryDay, ledgerIndex ?? null]
  );
  // Match the commit memo to a pending prediction: ledger proves the commit.
  if (memoType === "spreadcast/commit" && memoData && deliveryDay) {
    const hash = memoData.slice(11);
    await q("update predictions set tx_hash = $1 where commit_hash = $2 and tx_hash is null", [tx.hash, hash]);
  }
}

async function startXrplListener() {
  if (!ANCHOR_ADDRESS) {
    log("xrpl listener: no XRPL_ANCHOR_ADDRESS configured — idle until set");
    return;
  }
  const { Client } = await import("xrpl");
  let backoff = 5;
  for (;;) {
    const client = new Client(XRPL_WSS);
    try {
      await client.connect();
      backoff = 5;
      log(`xrpl listener: subscribed to ${ANCHOR_ADDRESS} via ${XRPL_WSS}`);
      client.on("transaction", async (ev) => {
        const tx = ev.tx_json ?? ev.transaction;
        if (tx?.hash || ev.hash) {
          try { await recordChainTx({ ...tx, hash: tx.hash ?? ev.hash }, ev.ledger_index); }
          catch (e) { log("chain_tx record failed", e.message); }
        }
      });
      await client.request({ command: "subscribe", accounts: [ANCHOR_ADDRESS] });
      await new Promise((resolve) => client.once("disconnected", resolve));
      log("xrpl listener: disconnected, reconnecting");
    } catch (e) {
      log(`xrpl listener error: ${e.message}; retry in ${backoff}s`);
    }
    try { await client.disconnect(); } catch {}
    await new Promise((r) => setTimeout(r, backoff * 1000));
    backoff = Math.min(backoff * 2, 120);
  }
}

/** Backfill safety net: pull recent account_tx in case the stream dropped. */
async function backfillChainTxs() {
  if (!ANCHOR_ADDRESS) return "no anchor address";
  const { Client } = await import("xrpl");
  const client = new Client(XRPL_WSS);
  await client.connect();
  try {
    const res = await client.request({ command: "account_tx", account: ANCHOR_ADDRESS, limit: 200 });
    let n = 0;
    for (const item of res.result.transactions ?? []) {
      const tx = item.tx_json ?? item.tx;
      const hash = tx?.hash ?? item.hash;
      if (hash) { await recordChainTx({ ...tx, hash }, item.ledger_index ?? tx?.ledger_index); n++; }
    }
    return `scanned ${n} txs`;
  } finally {
    await client.disconnect();
  }
}

// ─── game RPC API ─────────────────────────────────────────────
// The web app (local dev + Vercel) talks to Postgres exclusively through
// these bearer-token endpoints — the database itself stays localhost-only.
const API_TOKEN = process.env.SPREADCAST_API_TOKEN || "";
const newId = () => randomBytes(8).toString("hex");

function playerOut(r) {
  return { id: r.id, name: r.name, wallet: r.wallet, demo: r.is_demo };
}
// pg returns `date` columns as local-midnight Dates; format via local
// components (server TZ = Europe/Ljubljana) — toISOString would shift a day.
const day10 = (d) =>
  d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : String(d).slice(0, 10);
function predOut(r) {
  return {
    userId: r.player_id, day: day10(r.delivery_day), band: r.band,
    exact: r.exact_guess == null ? null : Number(r.exact_guess),
    salt: r.salt, hash: r.commit_hash, txHash: r.tx_hash,
    submittedAt: r.submitted_at,
    correct: r.correct, streak: r.streak,
    multiplier: r.multiplier == null ? undefined : Number(r.multiplier),
    points: r.points ?? undefined,
    absError: r.abs_error == null ? null : Number(r.abs_error),
  };
}
function roundOut(r) {
  return {
    day: day10(r.delivery_day),
    status: r.status,
    boundaries: r.boundaries.map(Number),
    closesAt: new Date(r.closes_at).getTime(),
    opensAt: new Date(r.opens_at).getTime(),
    source: r.source, resolution: r.resolution,
    values: r.raw_values ? r.raw_values.map(Number) : undefined,
    hourly: r.hourly ? r.hourly.map(Number) : undefined,
    spread: r.spread == null ? undefined : Number(r.spread),
    outcomeBand: r.outcome_band ?? undefined,
    settledAt: r.settled_at ?? undefined,
  };
}

const rpcMethods = {
  // A player IS an XRPL r-address — created on first server-verified Xaman
  // sign-in, name chosen afterwards (null until then).
  async findOrCreatePlayerByWallet({ wallet }) {
    const addr = String(wallet ?? "").trim();
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr)) return { error: "That doesn't look like an XRPL r-address." };
    // Single upsert so two concurrent sign-ins for one wallet can't race the
    // select-then-insert into a unique violation.
    const r = await q(
      "insert into players (id, wallet) values ($1, $2) on conflict (wallet) do update set wallet = excluded.wallet returning *",
      [newId(), addr]
    );
    return { user: playerOut(r.rows[0]) };
  },

  async getUser({ id }) {
    const r = await q("select * from players where id = $1", [id]);
    return { user: r.rowCount ? playerOut(r.rows[0]) : null };
  },

  async setPlayerName({ id, name }) {
    const nm = String(name ?? "").trim();
    if (nm.length < 2 || nm.length > 24) return { error: "Nickname must be 2–24 characters." };
    const r = await q("update players set name = $2 where id = $1 returning *", [id, nm]);
    return r.rowCount ? { user: playerOut(r.rows[0]) } : { error: "Session expired — connect again." };
  },

  async submitPrediction({ userId, band, exact }) {
    const now = localTime();
    const day = now.minutes < CLOSE_MIN ? addDays(now.day, 1) : now.minutes >= OPEN_MIN ? addDays(now.day, 2) : null;
    if (!day) return { error: "Predictions are closed right now — the next round opens at 15:00." };
    const round = await q("select 1 from rounds where delivery_day = $1 and status = 'open' and closes_at > now()", [day]);
    if (!round.rowCount) return { error: "This round just closed." };
    if (!Number.isInteger(band) || band < 0 || band > 4) return { error: "Pick one of the five bands." };
    if (exact != null && (!Number.isFinite(exact) || exact < 0 || exact > 4000)) return { error: "Exact spread guess must be between 0 and 4000 €/MWh." };
    const user = await q("select * from players where id = $1", [userId]);
    if (!user.rowCount) return { error: "Sign in first." };
    if (!user.rows[0].wallet) return { error: "Connect your XRPL wallet first." };
    if (!user.rows[0].name) return { error: "Choose a nickname first." };
    const salt = randomBytes(16).toString("hex");
    const hash = sha256(`${day}|${band}|${exact ?? ""}|${salt}`);
    await q(
      `insert into predictions (delivery_day, player_id, band, exact_guess, salt, commit_hash)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (delivery_day, player_id) do update set
         band = $3, exact_guess = $4, salt = $5, commit_hash = $6, tx_hash = null, submitted_at = now()`,
      [day, userId, band, exact ?? null, salt, hash]
    );
    return { prediction: { day, band, exact: exact ?? null, hash } };
  },

  async attachCommitTx({ userId, day, txHash }) {
    const r = await q("update predictions set tx_hash = $3 where delivery_day = $1 and player_id = $2 returning 1", [day, userId, String(txHash).slice(0, 80)]);
    return { ok: r.rowCount > 0 };
  },

  async getPrediction({ userId, day }) {
    const r = await q("select * from predictions where delivery_day = $1 and player_id = $2", [day, userId]);
    return { prediction: r.rowCount ? predOut(r.rows[0]) : null };
  },

  /** Everything the play screen needs in one call. */
  async roundState({ userId }) {
    const now = localTime();
    const openDay = now.minutes < CLOSE_MIN ? addDays(now.day, 1) : now.minutes >= OPEN_MIN ? addDays(now.day, 2) : null;
    let open = null;
    if (openDay) {
      const r = await q("select * from rounds where delivery_day = $1 and status = 'open'", [openDay]);
      if (r.rowCount) {
        // Only picks locked on-chain count as participants — an unsigned pick
        // does not exist as far as the game is concerned.
        const participants = await q(
          `select count(*)::int c from predictions p
            join players u on u.id = p.player_id and not u.is_demo
            where p.delivery_day = $1 and p.tx_hash is not null and p.tx_hash not like 'SIMULATED-%'`,
          [openDay]
        );
        open = { ...roundOut(r.rows[0]), participants: participants.rows[0].c };
      }
    }
    const latestQ = await q("select * from rounds where status = 'settled' order by delivery_day desc limit 1");
    const latest = latestQ.rowCount ? roundOut(latestQ.rows[0]) : null;
    let mine = null, myLatest = null, user = null;
    if (userId) {
      const u = await q("select * from players where id = $1", [userId]);
      user = u.rowCount ? playerOut(u.rows[0]) : null;
      if (user && open) {
        const p = await q("select * from predictions where delivery_day = $1 and player_id = $2", [open.day, userId]);
        mine = p.rowCount ? predOut(p.rows[0]) : null;
      }
      if (user && latest) {
        const p = await q("select * from predictions where delivery_day = $1 and player_id = $2", [latest.day, userId]);
        myLatest = p.rowCount ? predOut(p.rows[0]) : null;
      }
    }
    const boundaries = (await q("select value from meta where key = 'boundaries'")).rows[0].value.map(Number);
    return {
      now: { day: now.day, hh: now.hh, mm: now.mm },
      user, open, latest, mine, myLatest, boundaries,
      nextOpensAt: localMomentUtc(now.day, OPEN_MIN).getTime(),
      nextDay: addDays(now.day, 2),
    };
  },

  async leaderboard({ scope }) {
    const week = isoWeek(localTime().day);
    // Only on-chain commits count anywhere on the board: tx_hash observed by
    // the ledger listener, never a SIMULATED- leftover from the demo era.
    const rows = await q(
      `select p.player_id, u.name, u.wallet,
              coalesce(sum(p.points), 0)::int points, count(*)::int played,
              (count(*) filter (where p.correct))::int correct,
              sum(p.abs_error) filter (where p.exact_guess is not null) abs_err,
              (count(*) filter (where p.exact_guess is not null))::int guesses
       from predictions p
       join rounds r on r.delivery_day = p.delivery_day and r.status = 'settled'
       join players u on u.id = p.player_id and not u.is_demo
       where p.tx_hash is not null and p.tx_hash not like 'SIMULATED-%'
         and ($1 = 'season' or to_char(p.delivery_day, 'IYYY-"W"IW') = $2)
       group by 1, 2, 3`,
      [scope === "week" ? "week" : "season", week]
    );
    const lastSettled = await q("select delivery_day from rounds where status = 'settled' order by delivery_day desc limit 1");
    const streaks = new Map();
    if (lastSettled.rowCount) {
      const s = await q("select player_id, streak from predictions where delivery_day = $1", [lastSettled.rows[0].delivery_day]);
      for (const row of s.rows) streaks.set(row.player_id, row.streak ?? 0);
    }
    const out = rows.rows.map((r) => ({
      rank: 0,
      playerId: r.player_id,
      name: r.name,
      wallet: r.wallet ? `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}` : null,
      points: r.points,
      played: r.played,
      correct: r.correct,
      streak: streaks.get(r.player_id) ?? 0,
      absError: r.guesses > 0 ? Math.round(Number(r.abs_err) * 100) / 100 : null,
      isDemo: false,
      pending: false,
      signedPending: false,
    }));
    // Players with a live (not-yet-settled) forecast appear immediately —
    // the board should never look empty between close and settlement. Same
    // rule though: a pick shows up only once its commit is on-chain.
    const pending = await q(
      `select p.player_id, u.name, u.wallet
       from predictions p
       join rounds r on r.delivery_day = p.delivery_day and r.status != 'settled'
       join players u on u.id = p.player_id and not u.is_demo
       where p.tx_hash is not null and p.tx_hash not like 'SIMULATED-%'
         and ($1 = 'season' or to_char(p.delivery_day, 'IYYY-"W"IW') = $2)
       group by 1, 2, 3`,
      [scope === "week" ? "week" : "season", week]
    );
    const byId = new Map(out.map((r) => [r.playerId, r]));
    for (const p of pending.rows) {
      const existing = byId.get(p.player_id);
      if (existing) {
        existing.pending = true;
        existing.signedPending = true;
      } else {
        out.push({
          rank: 0, playerId: p.player_id, name: p.name,
          wallet: p.wallet ? `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}` : null,
          points: 0, played: 0, correct: 0, streak: 0, absError: null,
          isDemo: false, pending: true, signedPending: true,
        });
      }
    }
    out.sort(
      (x, y) =>
        y.points - x.points ||
        (x.absError ?? Infinity) - (y.absError ?? Infinity) ||
        y.correct - x.correct ||
        Number(y.signedPending) - Number(x.signedPending)
    );
    out.forEach((r, i) => {
      r.rank = i + 1;
      delete r.playerId;
    });
    return { rows: out.slice(0, 100) };
  },

  async archive() {
    const rounds = await q("select * from rounds where status = 'settled' order by delivery_day desc");
    const anchorsQ = await q("select * from anchors order by week desc");
    return {
      rounds: rounds.rows.map(roundOut),
      anchors: anchorsQ.rows.map((a) => ({
        week: a.week, root: a.merkle_root, leaves: a.leaves, txHash: a.tx_hash, simulated: a.simulated, createdAt: a.created_at,
      })),
    };
  },

  /** Recent real daily swings for the Play-tab helper (oldest → newest). */
  async swingHistory() {
    const r = await q("select day, swing from price_history order by day desc limit 30");
    return { days: r.rows.map((x) => ({ day: day10(x.day), swing: Number(x.swing) })).reverse() };
  },

  async archiveDay({ day }) {
    const r = await q("select * from rounds where delivery_day = $1 and status = 'settled'", [day]);
    if (!r.rowCount) return { error: "Not settled." };
    const reveal = await q(
      `select p.*, u.name from predictions p join players u on u.id = p.player_id
       where p.delivery_day = $1 order by p.points desc nulls last`,
      [day]
    );
    return {
      round: roundOut(r.rows[0]),
      reveal: reveal.rows.map((p) => ({
        user: p.name, band: p.band,
        exact: p.exact_guess == null ? null : Number(p.exact_guess),
        salt: p.salt, hash: p.commit_hash, txHash: p.tx_hash,
        correct: p.correct, points: p.points ?? 0,
      })),
    };
  },
};

http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET") {
      // Public health snapshot (no secrets).
      const jobs = await q("select job, ok, detail, ran_at from job_runs order by id desc limit 12");
      const counts = await q(`select
        (select count(*) from rounds) rounds,
        (select count(*) from rounds where status = 'settled') settled,
        (select count(*) from players where not is_demo) players,
        (select count(*) from predictions where tx_hash is not null and tx_hash not like 'SIMULATED-%') predictions,
        (select count(*) from chain_txs) chain_txs`);
      return send(200, { ok: true, tz: TZ, now: localTime(), counts: counts.rows[0], recentJobs: jobs.rows });
    }
    if (req.method !== "POST" || req.url !== "/rpc") return send(404, { error: "not found" });
    if (!API_TOKEN || req.headers.authorization !== `Bearer ${API_TOKEN}`) return send(401, { error: "unauthorized" });
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 100_000) return send(413, { error: "too large" });
    }
    const { method, params } = JSON.parse(body || "{}");
    const fn = rpcMethods[method];
    if (!fn) return send(400, { error: `unknown method ${method}` });
    return send(200, await fn(params ?? {}));
  } catch (e) {
    log("rpc error", e);
    return send(500, { error: "internal error" });
  }
}).listen(8787, "0.0.0.0", () => log("game API + health on 0.0.0.0:8787"));

// ─── schedule (all Europe/Ljubljana) ──────────────────────────
const sched = (expr, name, fn) => cron.schedule(expr, () => jobRun(name, fn), { timezone: TZ });

sched("45 11 * * *", "close", closeDueRounds);
sched("5,20,40 13 * * *", "poll-prices", pollPrices);
sched("10,40 14 * * *", "poll-prices-retry", pollPrices);
sched("0 15 * * *", "settle", settleDueRounds);
sched("15,30 15 * * *", "settle-retry", settleDueRounds);
sched("5 15 * * *", "ensure-round", ensureOpenRound);
sched("10 15 * * 0", "weekly-anchor", weeklyAnchor);
sched("20 15 * * *", "price-history", refreshPriceHistory);
sched("*/30 * * * *", "chain-backfill", backfillChainTxs);
sched("0 * * * *", "heartbeat", async () => "alive");

// ─── boot ─────────────────────────────────────────────────────
(async () => {
  await jobRun("boot-ensure-round", ensureOpenRound);
  await jobRun("boot-close", closeDueRounds);
  await jobRun("boot-settle", settleDueRounds);
  await jobRun("boot-price-history", refreshPriceHistory);
  startXrplListener();
  log("spreadcast worker up");
})();
