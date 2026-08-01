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
const ASSET_FIELDS = "capex|raised|remaining|annualRevenue|sinkingFund|tvl|reserves|replacementFund|liveTarget|liveRaised";

const RULES = [
  {
    id: "raw-status-enum",
    why: "renders the status enum instead of statusLabel()/STATUS_BADGE — produced three spellings of one status",
    re: /\.status\.replace\s*\(/g,
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
    why: "prints a MW/MWh field directly; fmtPower/fmtEnergy pick the unit, so 350 kW does not become 0.3 MW",
    re: /\{\s*[A-Za-z_$][\w.$]*\.(?:capacityMw|energyMwh|mw|mwh|totalMw)\s*(?:\.toFixed\(\d\))?\s*\}\s*(?:MW|MWh)\b/g,
  },
  {
    id: "currency-prefixed-rate",
    why: "writes a per-unit rate with the symbol in front; the app writes rates as <number> €/MWh everywhere else",
    re: /fmtMoney\s*\([^)]*\)\s*\}\s*\/\s*MWh/g,
  },
  {
    id: "usdc-in-copy",
    why: "names USDC; the protocol settles in RLUSD, a different asset by a different issuer",
    re: /\bUSDC\b/g,
  },
];

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

if (flag("canary")) {
  // Each rule gets a line that should trip it. A lint nobody has seen fail is
  // indistinguishable from a lint with a typo in its regex.
  const samples = {
    "raw-status-enum": 'const s = vault.status.replace("_", " ");',
    "kind-decides-yield-label": 'const l = v.kind === "showcase" ? "gross yield" : "APY";',
    "asset-figure-as-USD": 'const v = fmtMoney(remaining, "USD");',
    "raw-megawatt-field": "<span>{site.capacityMw.toFixed(1)} MW</span>",
    "currency-prefixed-rate": "<span>{fmtMoney(snap.pricePerMwh, c)}/MWh</span>",
    "usdc-in-copy": 'const label = "Settled in USDC";',
  };
  let ok = true;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const fires = rule.re.test(samples[rule.id] ?? "");
    console.log(`  ${fires ? "fires" : "SILENT"}  ${rule.id}`);
    if (!fires) ok = false;
  }
  console.log(ok ? "\ncanary ok: every rule fires on a violation." : "\nCANARY FAILED — a rule cannot detect its own defect.");
  process.exit(ok ? 0 : 1);
}

console.log(`files scanned: ${files.length}   rules: ${RULES.length}   violations: ${findings.length}\n`);
for (const f of findings) {
  console.log(`  ${f.file}:${f.line}  [${f.id}]`);
  console.log(`      ${f.snippet}`);
  console.log(`      ${f.why}`);
}
if (!findings.length) console.log("  clean.");
process.exit(findings.length ? 1 : 0);
