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
import { existsSync, mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
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
// Freeze motion before measuring anything.
//
// Six .globe-pin elements are mid-opacity-transition at the moment this runs on
// dashboard-v2 — measured, not guessed: document.getAnimations() reported 7
// running at settle time. painted() excludes opacity EXACTLY 0, so a pin caught
// at 0.4 counts as visible, and pins sit absolutely positioned on a rotating
// globe, drifting in and out of the viewport. That is an intermittent finding
// on something nobody can see, and it is the same trap that made the a11y focus
// check report a correct skip link as stranded: measuring during a transition
// reads a position no user is ever shown for more than a frame.
//
// transition: none does not pause a transition, it snaps the element to its
// target — so a pin fading toward 0 lands at 0 and is excluded deterministically.
// Verified: running animations 7 -> 0.
const __freeze = document.createElement("style");
__freeze.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
document.head.appendChild(__freeze);
void document.body.offsetHeight;
await new Promise((r) => setTimeout(r, 50));

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
    // A box can sit fully in bounds while its text does not — inherited
    // white-space: nowrap did that to two paragraphs in the expanded archive
    // day. The two checks above measure the ELEMENT, so neither can see it.
    // Range rects measure the text.
    if (!el.children.length && el.textContent.trim() && !inScroller(el) && cs.overflowX === "visible") {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const rects = [...rng.getClientRects()].filter(x => x.height > 0);
      if (rects.length) {
        const past = Math.round(Math.max(...rects.map(x => x.right)) - r.right);
        if (past > 2) out.push({ kind: "text-spill", el: label(el), detail: past + "px past its box" });
      }
    }
  }
  return { overflow: out.filter(x => x.kind === "overflows-viewport"), clipped: out.filter(x => x.kind === "clipped-text"),
           spill: out.filter(x => x.kind === "text-spill"),
           pageOverflow: document.documentElement.scrollWidth > W + 1 };
}

// Every group of mutually-exclusive options this app uses.
//
// .perf-toggle used to be in this list and does not belong: it is a disclosure,
// not one of a set of options, and listing it here meant the pass below "opened"
// it as a side effect and then found nothing left to open. Handled by the
// disclosure pass now, which is the one that can tell open from closed.
const GROUPS = [".v2-tabs .v2-tab", ".seg .seg-btn", ".sc-seg button", ".sc-band-card"];
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

// Disclosures. Everything above enumerates mutually-exclusive OPTIONS — tabs
// and segmented controls, which are always showing one of their states. A
// disclosure defaults to hiding its content entirely, so a defect inside one
// is invisible to anyone who does not think to click.
//
// Worth being exact about what this does and does not buy. The duplicate
// revenue row inside SiteMonitor was NOT hidden from this file — .perf-toggle
// was listed in GROUPS above, so the panel was opened and its geometry
// measured on every run. It survived because it was a CONTENT defect, and
// nothing here reads content. No sweep in this repo does. That one needed
// looking at.
//
// Take the first still-unopened toggle each time rather than an index: opening
// one re-renders and can reveal more. The seen-set is keyed on label + text so
// a toggle whose click silently fails cannot be picked forever.
const DISCLOSURE = '[aria-expanded="false"], details:not([open]) > summary';
const seen = new Set();
const opened = [];
for (let i = 0; i < 10; i++) {
  const next = [...document.querySelectorAll(DISCLOSURE)].filter(visible)
    .filter(e => !seen.has(label(e) + "|" + (e.textContent || "").trim().slice(0, 30)))[0];
  if (!next) break;
  const name = (next.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) || label(next);
  seen.add(label(next) + "|" + (next.textContent || "").trim().slice(0, 30));
  next.click();
  // Longer than the 450ms used for tabs: a disclosure often mounts its content
  // for the first time, and the archive rows fetch on open.
  await new Promise((r) => setTimeout(r, 900));
  opened.push(name);
  results.push({ state: "open -> " + name, ...check() });
}

const bad = results.filter(r => r.overflow.length || r.clipped.length || r.spill.length || r.pageOverflow);
return {
  statesChecked: results.length,
  groupsFound: GROUPS.filter(s => document.querySelectorAll(s).length > 0),
  disclosuresOpened: opened,
  problems: bad.map(r => ({ state: r.state, pageOverflow: r.pageOverflow,
    overflow: r.overflow.slice(0, 3), clipped: r.clipped.slice(0, 3), spill: r.spill.slice(0, 3) })),
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

// Chrome gets a throwaway profile per run, and it must be removed on the way
// out. Not doing so filled the disk: 714 abandoned directories at ~14MB each,
// 9.8GB, until nothing could open a file for writing — including every tool
// that would have diagnosed it. chrome.kill() was always here; deleting what
// mkdtempSync created was not.

// Clear profiles left by earlier runs. The exit-time cleanup below is
// best-effort and often cannot succeed: kill() takes down the Chrome parent but
// not its renderer and GPU children, and on Windows those keep a handle on the
// profile, so rmSync gets EPERM however long it retries. A stale directory is
// removable a moment later, once every child has actually gone — so the next
// run removes it. That bounds the mess at one directory instead of the 714 and
// 9.8GB that filled the disk.
// 10 minutes, not "any other directory": concurrent audits are normal here and
// deleting a sibling run's live profile would break it.
function sweepStaleProfiles(prefix) {
  try {
    const dir = tmpdir();
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue;
      const p = join(dir, name);
      try {
        if (statSync(p).mtimeMs < cutoff) rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch { /* in use, or gone — either is fine */ }
    }
  } catch { /* never let housekeeping break a run */ }
}
sweepStaleProfiles("state-");
const PROFILE = mkdtempSync(join(tmpdir(), "state-"));
const chrome = spawn(findChrome(), ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run",
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

  let states = 0, problems = 0, disclosures = 0;
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
        for (const t of p.spill || []) console.log(`        spill   : ${t.el}  ${t.detail}`);
      }
      // Print what was opened even when clean. A disclosure pass that silently
      // opened nothing looks exactly like one that opened everything and found
      // no problems, and the difference is the whole point of the pass.
      disclosures += (v.disclosuresOpened || []).length;
    }
    process.stderr.write(`  width ${w} ✓
`);
  }
  console.log(`
states exercised: ${states}   disclosures opened: ${disclosures}   problem states: ${problems}`);
  if (!problems) console.log("  clean.");
  if (problems) exitCode = 1;
} catch (e) { console.error(String(e)); exitCode = 1; }
finally { chrome.kill(); try {
    // maxRetries because kill() returns before Windows releases the
    // profile's file handles: the first version threw EPERM on a run whose
    // audit had already completed cleanly. And the catch because failing to
    // tidy up must never fail the audit — an unremoved directory is a
    // nuisance, a crashed sweep loses the result.
    rmSync(PROFILE, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  } catch (e) {
    console.error(`warn: left ${PROFILE} behind (${e.code}) — remove it if these accumulate`);
  } process.exit(exitCode); }
