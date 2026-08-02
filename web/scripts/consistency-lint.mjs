// Static lint for the consistency rules this codebase learned the hard way.
//
//   node scripts/consistency-lint.mjs
//   node scripts/consistency-lint.mjs --canary   # prove each rule can fire
//
// No browser, no server — it reads source. Every rule below exists because the
// same defect appeared on two surfaces and the second one shipped: a helper was
// introduced to fix one call site, and the call sites that did not change were
// invisible in the diff that introduced it. Nine of those in one session is
// enough to stop relying on remembering.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src";
const flag = (n) => process.argv.includes(`--${n}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(p)) out.push(p);
  }
  return out;
}

// Comments explain the rules; they are not violations of them. Strips // and
// /* */ so a comment quoting the old pattern cannot trip its own rule — which
// it did: grepping for `status.replace` matched only the comments describing
// its removal.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(Math.max(0, m.length - p.length)));
}

// Asset-side only. listedFaceValue looked like one and is not: marketplace
// face value is shares x 1.00 of an RLUSD-pegged receipt token, so USD is right
// there. A rule that flags correct code gets switched off.
//
// claimable/claimed/distributed joined the list after "Claimable yield $0.00"
// on a vault page was found sitting one nav click from "€0.00" for the same
// field on the portfolio. They are not asset-side in the capex sense, but they
// carry the same rule: types.ts declares claimable as "claimable yield (vault
// currency)", so a hardcoded "USD" is wrong on all of them. deposited stays
// OUT — principal really is RLUSD, and "Your deposit $0.00" is correct.
const ASSET_FIELDS = "capex|raised|remaining|annualRevenue|sinkingFund|tvl|reserves|replacementFund|liveTarget|liveRaised|claimable|claimed|distributed";

const RULES = [
  {
    id: "raw-enum-render",
    why: "renders a stored enum or index straight to screen — use statusLabel()/STATUS_BADGE for status, BAND_NAMES for band; the reveal table printed \"2\" under a column headed BAND",
    // Was `.status.replace(` alone, which is the shape of the defect that
    // prompted it and not the invariant. The invariant is that a value stored
    // as an enum or an index never reaches the screen unmapped, and the reveal
    // table breached it with `{p.band}` — a bare 0-4 in the one table whose
    // purpose is letting a stranger check a pick. That went unseen because the
    // rule described the old mistake instead of the rule.
    //
    // outcomeName is deliberately absent: it arrives as "Swingy", a display
    // string, so rendering it raw is correct and flagging it would be the
    // listedFaceValue mistake noted at the top of this file.
    // BAND_NAMES[p.band] does not match — the braces must wrap the access.
    //
    // (?<!\$) excludes template literals. `http ${res.status} from ${url}` is an
    // HTTP status code in an error message, not an enum on screen, and the first
    // version of this rule flagged two of those — a rule that flags correct code
    // gets switched off, which is the note at the top of this file.
    re: /\.status\.replace\s*\(|(?<!\$)\{\s*[A-Za-z_$][\w.$]*\.(?:status|kind|band|mode)\s*\}/g,
  },
  {
    id: "kind-decides-yield-label",
    why: 'keys a yield label on kind === "showcase"; whether apyBps is gross is a property of the DATA — use apyBpsIsGross()',
    // Only where the label describes apyBps. VaultDetail labels
    // split.depositorBps as "Net yield" or "Depositor APY", and THAT choice is
    // about investability — a showcase site has no depositors — so `kind` is
    // the right key there. Lines that mention the split are excluded.
    re: /kind\s*===\s*"showcase"(?![^\n]*(?:depositorBps|split\.))[^\n]*\b(gross|APY|yield)\b/gi,
  },
  {
    id: "asset-figure-as-USD",
    why: 'formats an asset-side figure (EUR) as "USD" — use the vault currency or ASSET_CURRENCY; only RLUSD deposits are USD',
    re: new RegExp(`fmt(?:Money|Compact)\\s*\\(\\s*[^,)]*(?:${ASSET_FIELDS})[^,)]*,\\s*"USD"`, "gi"),
  },
  {
    id: "raw-megawatt-field",
    why: "prints a power/energy field with a hardcoded unit; fmtPower/fmtEnergy pick it, so 350 kW does not become 0.3 MW and 6400 kWh does not stay 6400 kWh",
    // powerKw and energyKwh added: those are the spec fields, and they are the
    // ones that cross a unit boundary — a 6400 kWh site reads better as 6.4 MWh
    // and fmtEnergy already does that. The original list named only the MW
    // fields, which is the shape of the NetworkPanel defect rather than the rule.
    //
    // Deliberately NOT listed: chargedMwh/dischargedMwh, printed as "MWh" in
    // four places. Checked rather than assumed — fmtEnergy has no GWh tier, so
    // routing them through it returns the same string with one decimal fewer,
    // and cumulative YTD throughput on an operating site never falls under
    // 1 MWh. The field name and the unit agree and no magnitude misleads.
    // solarKwp likewise: kWp is peak capacity, a unit neither formatter models.
    re: /\{\s*[A-Za-z_$][\w.$]*\.(?:capacityMw|energyMwh|mw|mwh|totalMw|powerKw|energyKwh)\s*(?:\.toFixed\(\d\))?\s*\}\s*(?:MW|MWh|kW|kWh)\b/g,
  },
  {
    id: "currency-prefixed-rate",
    why: "writes a per-unit rate with the symbol in front; the app writes rates as <number> €/MWh everywhere else",
    re: /fmtMoney\s*\([^)]*\)\s*\}\s*\/\s*MWh/g,
  },
  {
    id: "raw-source-ternary",
    why: 'renders `source` without sourceLabel()/sourceLabelShort() — either branching on === "entsoe" (whose else-branch stamped SIMULATED on real market data) or printing the raw field, which put "energy-charts" on the shareable result page while two other surfaces showed two other spellings',
    // Two shapes, and the second was added after the first missed a call site.
    // The original rule matched only the ternary — the mistake I had just made —
    // so the RAW render on the result page went straight through it and was
    // found by reading the page, not by the lint written to prevent exactly
    // this. A rule encodes the defect you saw, not the one you did not.
    re: /source\s*===\s*"entsoe"|\{\s*[A-Za-z_$][\w.$]*\.source\s*\}/g,
  },
  {
    id: "kind-decides-provenance",
    why: '`kind` says where the receipt token lives, not where a number was measured — a telemetry card keyed on kind claimed MWh and battery cycles came from the ledger',
    re: /kind\s*===\s*"onchain"[^\n]*\b(?:Mainnet|telemetry|feed|source|oracle)\b/gi,
  },
  {
    id: "usdc-in-copy",
    why: "names USDC; the protocol settles in RLUSD, a different asset by a different issuer",
    re: /\bUSDC\b/g,
  },
];

// Cross-file rule: one value must not be formatted to two precisions.
//
// Regexes catch a bad line. This catches a bad PAIR — snap.netYtd was written
// fmtMoney(…, 0) in the Revenue card and fmtMoney(…) in the metrics card, and
// at 1440 both cards are on screen together reading "€12,950" and "€12,950.00".
// Neither line is wrong alone, which is why every single-line rule above was
// blind to it, and why it is the same shape as the nine sibling-misses that
// prompted this file: a call site got an argument and its twin did not.
const MONEY_CALL = /\bfmt(?:Money|Num)\s*\(\s*([A-Za-z_$][\w.$]*)\s*(?:,\s*([^,()]+?)\s*)?(?:,\s*(\d+)\s*)?\)/g;
function precisionSplits(fileList, read) {
  const byValue = new Map();
  for (const f of fileList) {
    const src = stripComments(read(f));
    MONEY_CALL.lastIndex = 0;
    let m;
    while ((m = MONEY_CALL.exec(src))) {
      const [, value, , decimals] = m;
      // A bare literal or a loop variable says nothing; only field accesses
      // name the same quantity reliably across call sites.
      if (!value.includes(".")) continue;
      const d = decimals === undefined ? "default" : decimals;
      const line = src.slice(0, m.index).split("\n").length;
      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push({ file: f, line, d, text: m[0] });
    }
  }
  const out = [];
  for (const [value, uses] of byValue) {
    const kinds = [...new Set(uses.map((u) => u.d))];
    if (kinds.length < 2) continue;
    out.push({ value, kinds, uses });
  }
  return out;
}

// Same unit, two precisions.
//
// precisionSplits above keys on the value EXPRESSION, which is right for money
// fields but could not have caught the energy-flow defect: that diagram printed
// -233.79, 74.4, 138.6, 47.56 and 167.5 in one figure, five readings of the
// same unit at three different significant-figure counts, and no two of them
// came from the same expression. What they shared was "kW".
//
// So this keys on the trailing unit token instead. A first attempt flagged any
// .toFixed at a render site and returned 22 hits, nearly all of them a domain
// convention applied consistently (prices at 2dp, SoC at 1dp, share at 0dp) —
// a lint that cries wolf 22 times is one nobody reads. Splitting by unit keeps
// only the cases where the SAME unit disagrees with itself.
const UNIT_FIXED = /([A-Za-z_$][\w.$]*)\s*(?:\.toFixed\s*\(\s*(\d)\s*\)|\s*\*\s*(?:10|100|1000)\s*\)\s*\/\s*(10|100|1000))\s*\}?\s*(?:<\/?tspan[^>]*>|\{" "\})?\s*(€\/MWh|kWh|MWh|kWp|kW|MW|%)(?![A-Za-z])/g;

// Units whose readings are one quantity class, so a precision split between
// ANY two of them is a real split — the energy-flow diagram printed five kW
// readings at three significant-figure counts and no two shared an expression.
//
// "%" and "€/MWh" are deliberately absent. "%" is a suffix on unrelated
// quantities (state of charge, round-trip efficiency, portfolio share, funding
// progress) that legitimately want different precision, and keying on it alone
// reported 12 sites of which one was a defect. Both are still checked by name
// below, which is what actually found that one: sharePct at 0dp and 2dp.
const UNIFORM_UNITS = new Set(["kW", "MW", "kWh", "MWh", "kWp"]);

// Same unit, two precisions. Grouped two ways, because the two catch different
// halves and each one alone missed a real defect:
//   by name+unit  - sharePct printed toFixed(0) in a donut centre and
//                   toFixed(2) in the legend touching it. Precise, no noise.
//   by unit alone - the flow diagram's kW readings, which share no name.
// The existing precisionSplits() keys on the expression too, but only inside
// fmtMoney/fmtNum calls, so every .toFixed site was invisible to it.
function unitPrecisionSplits(fileList, read) {
  const groups = new Map();
  const add = (key, rec) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(rec); };
  for (const f of fileList) {
    const src = stripComments(read(f));
    UNIT_FIXED.lastIndex = 0;
    let m;
    while ((m = UNIT_FIXED.exec(src))) {
      const dp = m[2] !== undefined ? Number(m[2]) : Math.log10(Number(m[3]));
      const unit = m[4];
      // Trailing segment only: snap.socPct and vault.metrics.socPct are the
      // same quantity reached by two paths, and should not read as two.
      const name = m[1].split(".").filter(Boolean).pop();
      const rec = {
        file: relative(".", f).replace(/\\/g, "/"),
        line: src.slice(0, m.index).split("\n").length,
        dp, text: m[0].replace(/\s+/g, " ").trim().slice(0, 88),
      };
      add(`${name} (${unit})`, rec);
      if (UNIFORM_UNITS.has(unit)) add(unit, rec);
    }
  }
  const out = [];
  for (const [label, uses] of groups) {
    const kinds = [...new Set(uses.map((u) => u.dp))].sort();
    if (kinds.length < 2) continue;
    // A name group is a strict subset of its unit group; report the unit group
    // only when it says something the name groups did not.
    out.push({ label, kinds, uses });
  }
  return out.filter((g, _i, all) =>
    !UNIFORM_UNITS.has(g.label) ||
    !all.some((o) => o !== g && o.label.endsWith(`(${g.label})`) && o.uses.length === g.uses.length));
}

const files = walk(ROOT);
const findings = [];
for (const f of files) {
  const raw = readFileSync(f, "utf8");
  const src = stripComments(raw);
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(src))) {
      const line = src.slice(0, m.index).split("\n").length;
      findings.push({
        file: relative(".", f).replace(/\\/g, "/"),
        line, id: rule.id, why: rule.why,
        snippet: raw.split("\n")[line - 1].trim().slice(0, 88),
      });
    }
  }
}

for (const split of precisionSplits(files, (f) => readFileSync(f, "utf8"))) {
  for (const u of split.uses) {
    findings.push({
      file: relative(".", u.file).replace(/\\/g, "/"),
      line: u.line, id: "precision-split",
      why: `${split.value} is formatted to ${split.kinds.join(" and ")} decimals across ${split.uses.length} call sites — one value, two presentations`,
      snippet: u.text,
    });
  }
}

for (const split of unitPrecisionSplits(files, (f) => readFileSync(f, "utf8"))) {
  for (const u of split.uses) {
    findings.push({
      file: u.file, line: u.line, id: "unit-precision-split",
      why: `${split.label} is printed to ${split.kinds.join(" and ")} decimals across ${split.uses.length} render sites — one quantity, several presentations, so readings that sit side by side disagree on how precise they are`,
      snippet: u.text,
    });
  }
}

if (flag("canary")) {
  // Each rule gets a line that should trip it. A lint nobody has seen fail is
  // indistinguishable from a lint with a typo in its regex.
  const samples = {
    "raw-enum-render": '<td>{p.band}</td>',
    "kind-decides-yield-label": 'const l = v.kind === "showcase" ? "gross yield" : "APY";',
    "asset-figure-as-USD": 'const v = fmtMoney(remaining, "USD");',
    "raw-megawatt-field": "<span>{site.capacityMw.toFixed(1)} MW</span>",
    "currency-prefixed-rate": "<span>{fmtMoney(snap.pricePerMwh, c)}/MWh</span>",
    "raw-source-ternary": 'const t = r.source === "entsoe" ? "ENTSO-E A44" : "SIMULATED";',
    "kind-decides-provenance": 'v={vault.kind === "onchain" ? "XRPL Mainnet" : "On-site telemetry"}',
    "usdc-in-copy": 'const label = "Settled in USDC";',
  };
  let ok = true;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const fires = rule.re.test(samples[rule.id] ?? "");
    console.log(`  ${fires ? "fires" : "SILENT"}  ${rule.id}`);
    if (!fires) ok = false;
  }
  // precision-split is a cross-FILE rule: no single line violates it, so it
  // needs a pair rather than a sample. Both directions matter — a rule that
  // fires on a matched pair too would flag every consistent call site in the
  // codebase, which is worse than not having it.
  const pair = { "a.tsx": "const a = fmtMoney(snap.netYtd, ccy, 0);", "b.tsx": "const b = fmtMoney(snap.netYtd, ccy);" };
  const matched = { "a.tsx": "const a = fmtMoney(snap.netYtd, ccy, 0);", "b.tsx": "const b = fmtMoney(snap.netYtd, ccy, 0);" };
  const keys = Object.keys(pair);
  const splitFires = precisionSplits(keys, (f) => pair[f]).length === 1;
  const splitSilent = precisionSplits(keys, (f) => matched[f]).length === 0;
  console.log(`  ${splitFires && splitSilent ? "fires" : "SILENT"}  precision-split` +
    `  (mismatched pair: ${splitFires ? "fires" : "MISSED"}; matched pair: ${splitSilent ? "silent" : "FALSE POSITIVE"})`);
  if (!splitFires || !splitSilent) ok = false;

  // unit-precision-split is cross-file too, and it groups two ways, so one
  // sample cannot exercise it. Case (c) is the one that matters most: an
  // earlier version keyed on the unit alone, reported 12 percent sites of which
  // exactly one was a defect, and a lint that cries wolf 12 times is one nobody
  // reads. It has to stay silent on quantities that merely share a suffix.
  const unitCases = [
    ["kW across expressions", true,
      { "a.tsx": "<text>{Math.round(live.housePowerKw * 100) / 100} <tspan>kW</tspan></text>\n<text>{Math.round(ch.solarKw * 10) / 10} kW</text>" }],
    ["one value, donut vs legend", true,
      { "a.tsx": "centerLabel={`${sharePct.toFixed(0)}%`}\n<div>{sharePct.toFixed(2)}%</div>" }],
    ["same value via two paths", true,
      { "a.tsx": "<div>{snap.socPct.toFixed(1)}%</div>", "b.tsx": "<div>{vault.metrics.socPct.toFixed(2)}%</div>" }],
    ["one formatter, one precision", false,
      { "a.tsx": "centerLabel={fmtPct(sharePct, 2)}\n<div>{sharePct.toFixed(2)}%</div>" }],
    ["different quantities sharing %", false,
      { "a.tsx": "<div>{snap.socPct.toFixed(1)}%</div>\n<div>{row.utilizationPct.toFixed(0)}%</div>" }],
  ];
  let unitOk = true;
  for (const [name, expect, src] of unitCases) {
    const fired = unitPrecisionSplits(Object.keys(src), (f) => src[f]).length > 0;
    if (fired !== expect) unitOk = false;
    console.log(`  ${fired === expect ? (expect ? "fires" : "quiet") : "WRONG"}  unit-precision-split  (${name})`);
  }
  if (!unitOk) ok = false;

  console.log(ok ? "\ncanary ok: every rule fires on a violation." : "\nCANARY FAILED — a rule cannot detect its own defect.");
  process.exit(ok ? 0 : 1);
}

console.log(`files scanned: ${files.length}   rules: ${RULES.length + 2}   violations: ${findings.length}\n`);
for (const f of findings) {
  console.log(`  ${f.file}:${f.line}  [${f.id}]`);
  console.log(`      ${f.snippet}`);
  console.log(`      ${f.why}`);
}
if (!findings.length) console.log("  clean.");
process.exit(findings.length ? 1 : 0);
