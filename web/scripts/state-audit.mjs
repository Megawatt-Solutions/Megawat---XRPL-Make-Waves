// Control-state audit — every tab, range and filter state, not just the state
// each page loads in.
//
//   node scripts/state-audit.mjs
//   node scripts/state-audit.mjs --widths 320,390
//
// Companion to responsive-audit.mjs (page geometry), overlay-audit.mjs (sheets
// and modals) and a11y-audit.mjs. Requires a server on --base.
//
// Every sweep before this one measured each page in exactly one state. Tabs,
// range selectors and filters re-render layout, so most of what the app can
// draw had never been looked at.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const guesses = [
    join(home, "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium", "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const hit = guesses.find(existsSync);
  if (hit) return hit;
  throw new Error("No Chrome found. Set CHROME_PATH, or: npx playwright install chromium");
}

const BASE = arg("base", "http://localhost:3100");
const ROUTES = arg("routes", "/,/dashboard-v2,/marketplace,/spreadcast,/spreadcast/board,/spreadcast/log,/vault/bess-ljubljana-01").split(",");
const WIDTHS = arg("widths", "320,390,844,1280").split(",").map(Number);
const PORT = Number(arg("port", 14200));

for (const r of ROUTES) {
  if (!r.startsWith("/")) {
    console.error(`Route ${JSON.stringify(r)} does not start with "/".`);
    console.error("On Git Bash, prefix the command with MSYS_NO_PATHCONV=1.");
    process.exit(2);
  }
}
const withFlag = (r) => r + (r.includes("?") ? "&" : "?") + "onboarding=0";

const CHECK = String.raw`
// Audit each page in every state its own controls can reach, not just the one
// it loads in. Tabs, range selectors and filters all re-render layout, and a
// sweep that only measures the default state never sees any of it.
const W = window.innerWidth;
const visible = (el) => {
  if (!el.getClientRects().length) return false;
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity) === 0) return false;
  }
  return true;
};
const inScroller = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ov = getComputedStyle(p).overflowX;
    if (ov === "auto" || ov === "scroll") return true;
  }
  return false;
};
const label = (el) => {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return el.tagName.toLowerCase() + (cls ? "." + cls : "");
};

// Geometry only — contrast and naming are covered by the a11y audit, and
// re-running them per state would triple the runtime for little.
function check() {
  const out = [];
  for (const el of [...document.querySelectorAll("body *")].filter(visible)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > W + 1 && !inScroller(el))
      out.push({ kind: "overflows-viewport", el: label(el), detail: "right=" + Math.round(r.right) });
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "hidden" || cs.textOverflow === "ellipsis") &&
        el.textContent && el.textContent.trim() && el.children.length <= 2 &&
        !el.closest(".odo-reel,.odo-strip,.sr-only,.chain-btn-name,.bottom-nav-item") &&
        (!cs.clipPath || cs.clipPath === "none") &&
        el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
      out.push({ kind: "clipped-text", el: label(el), detail: el.scrollWidth + ">" + el.clientWidth });
  }
  return { overflow: out.filter(x => x.kind === "overflows-viewport"), clipped: out.filter(x => x.kind === "clipped-text"),
           pageOverflow: document.documentElement.scrollWidth > W + 1 };
}

// Every group of mutually-exclusive options this app uses.
const GROUPS = [".v2-tabs .v2-tab", ".seg .seg-btn", ".sc-seg button", ".sc-band-card", ".perf-toggle"];
const results = [];
results.push({ state: "default", ...check() });

for (const sel of GROUPS) {
  const opts = [...document.querySelectorAll(sel)].filter(visible);
  if (!opts.length) continue;
  for (let i = 0; i < Math.min(opts.length, 6); i++) {
    // Re-query: clicking re-renders, so a captured node can be detached.
    const live = [...document.querySelectorAll(sel)].filter(visible);
    const el = live[i];
    if (!el) continue;
    const name = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22) || sel;
    el.click();
    await new Promise((r) => setTimeout(r, 450));
    // Concatenation, not a template literal: this whole body lives inside a
    // String.raw block, and an inner backtick ends it. The failure reads
    // "Unexpected identifier '$'" and points nowhere near the cause.
    results.push({ state: sel + " -> " + name, ...check() });
  }
}

const bad = results.filter(r => r.overflow.length || r.clipped.length || r.pageOverflow);
return {
  statesChecked: results.length,
  groupsFound: GROUPS.filter(s => document.querySelectorAll(s).length > 0),
  problems: bad.map(r => ({ state: r.state, pageOverflow: r.pageOverflow,
    overflow: r.overflow.slice(0, 3), clipped: r.clipped.slice(0, 3) })),
};
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.w = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data);
      if (m.id !== undefined && this.p.has(m.id)) { const { res, rej } = this.p.get(m.id); this.p.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) this.w = this.w.filter((x) => x.method !== m.method || (x.res(m.params), false)); }; }
  send(method, params = {}, sessionId) { const id = ++this.id;
    return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
  once(method, t = 25000) { return new Promise((res, rej) => { const x = { method, res }; this.w.push(x);
    setTimeout(() => { this.w = this.w.filter((y) => y !== x); rej(new Error("timeout " + method)); }, t); }); }
}
const connect = (u) => new Promise((r, j) => { const ws = new WebSocket(u); ws.onopen = () => r(new CDP(ws)); ws.onerror = () => j(new Error("ws")); });

const chrome = spawn(findChrome(), ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "state-"))}`, "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });

async function endpoint() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await sleep(150);
  }
  throw new Error("Chrome never exposed a debugging endpoint");
}

let exitCode = 0;
try {
  const b = await connect(await endpoint());
  const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  await s("Page.enable"); await s("Runtime.enable");

  let states = 0, problems = 0;
  for (const w of WIDTHS) {
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: w < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 768 });
    for (const route of ROUTES) {
      const loaded = b.once("Page.loadEventFired");
      await s("Page.navigate", { url: BASE + withFlag(route) });
      await loaded; await sleep(800);
      const res = await s("Runtime.evaluate", { expression: `(async () => { ${CHECK} })()`, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) { console.log(`  [${w}] ${route}: ERROR`); exitCode = 1; continue; }
      const v = res.result.value;
      states += v.statesChecked;
      for (const p of v.problems) {
        problems++;
        console.log(`  [${w}] ${route}  state: ${p.state}  pageOverflow=${p.pageOverflow}`);
        for (const o of p.overflow) console.log(`        overflow: ${o.el}  ${o.detail}`);
        for (const c of p.clipped) console.log(`        clipped : ${c.el}  ${c.detail}`);
      }
    }
    process.stderr.write(`  width ${w} ✓
`);
  }
  console.log(`
states exercised: ${states}   problem states: ${problems}`);
  if (!problems) console.log("  clean.");
  if (problems) exitCode = 1;
} catch (e) { console.error(String(e)); exitCode = 1; }
finally { chrome.kill(); process.exit(exitCode); }
