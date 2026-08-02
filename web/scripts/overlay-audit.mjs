// Open each overlay and audit it at phone widths — PORTRAIT AND LANDSCAPE.
//
//   node scripts/overlay-audit.mjs                       # portrait 320, 390
//   node scripts/overlay-audit.mjs --widths 658,844      # landscape
//
// Found the real one: at 844x390 the .modal is 487px tall inside a
// position: fixed .overlay that had overflow-y: visible, so "Open in Xaman app"
// sat 59px below the fold with no scroller able to reach it. On a landscape
// phone you could not connect a wallet.
// The static sweep never sees these: every sheet, modal and dialog in the app
// is behind a click, so the whole class has been unmeasured.
//
// The defect this is really hunting: an overlay TALLER than the viewport that
// does not scroll. On a 320x658 phone that silently puts the confirm button
// below the fold with no way to reach it — invisible to any check that only
// looks at width.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { existsSync } from "node:fs";
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
const CHROME = findChrome();
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const BASE = arg("base", "http://localhost:3100");
const PORT = Number(arg("port", 10300));
const WIDTHS = (arg("widths", "320,390")).split(",").map(Number);
const FORCE_H = arg("height") ? Number(arg("height")) : null;
const HEIGHTS = { 320: 658, 360: 800, 390: 844, 414: 896, 658: 320, 844: 390, 896: 414 };

// --as-connected: see the overlays that only exist with a wallet attached.
// wallet.tsx restores its session from localStorage on load, so seeding the
// keys it already reads reaches that state without modifying it. Watch-only,
// XRPL black-hole account — public, inert, signs nothing.
const CONNECTED_SEED =
  'localStorage.setItem("mw.xrplAddress","rrrrrrrrrrrrrrrrrrrrrhoLvTp");' +
  'localStorage.setItem("mw.xrplVia","watch");';
// Reaching the Provably-fair sheet needs a committed prediction by a signed-in
// user, and `commit` is React state — no storage seeding touches it. But the
// state it derives from arrives over the wire, so intercepting ONE response
// gets there without changing a line of app source. This is a fixture for the
// audit, not a mock of the product: it augments the real response and leaves
// every other request alone.
// String.raw, not a plain template. A backslash in a plain template literal is
// an escape: `\/` collapses to `/`, so the regex below emitted
// "if (!//api/spreadcast/round/.test(url))" — a line comment, which threw and
// left fetch un-patched. The case went on printing "trigger not present" and
// looked exactly like the unreachable state it had before.
const ROUND_SEED = String.raw`(function(){
  const of = window.fetch;
  window.fetch = async function(u){
    const r = await of.apply(this, arguments);
    const url = typeof u === "string" ? u : (u && u.url) || "";
    if (!/\/api\/spreadcast\/round/.test(url)) return r;
    const j = await r.clone().json().catch(function(){ return null; });
    if (!j || !j.open) return r;
    j.user = { id:"u1", email:"a@b.c", name:"probe", wallet:"rrrrrrrrrrrrrrrrrrrrrhoLvTp", verified:true };
    j.mine = { userId:"u1", day:j.open.day, band:2, exact:171.5,
      hash:"9f2c1a7b3e5d4f60a8c9b2d1e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f70", txHash:null, correct:null };
    return new Response(JSON.stringify(j), {status:200, headers:{"content-type":"application/json"}});
  };
})();`;

const asConnected = process.argv.includes("--as-connected");

// name, route, selector to click (null = already open), selector that should appear
const skipped = new Map();
const gated = new Map();
const CASES = [
  { name: "onboarding",        route: "/?onboarding=1",  open: null,               expect: ".ob-sheet, [role=dialog]" },
  // Never runs anonymously: .sc-commit-why only renders once a signed-in user
  // has committed a prediction, and `commit` is React state set by the commit
  // flow, so no amount of storage seeding reaches it. Kept in the list so the
  // summary at the bottom keeps saying it is unmeasured.
  { name: "spreadcast:fair",   route: "/spreadcast",     open: ".sc-commit-why",   expect: "[role=dialog], .sheet",
    precondition: "needs a committed prediction by a signed-in user", seed: "ROUND" },
  // These three were all FALSE PASSES. Disconnected, ".btn-accent" on either
  // route is the wallet CTA, so all three printed a green row for the SAME
  // "Connect XRPL wallet" modal — three lines that looked like three overlays,
  // identical 350x507 every run. expectText makes a case that opens something
  // else say so instead of passing.
  { name: "marketplace:sell",  route: "/marketplace",    open: ".btn-accent",      expect: "[role=dialog], .sheet, .overlay",
    expectText: "list a position", needsConnected: true },
  { name: "wallet:connect",    route: "/",               open: ".connect-btn",     expect: "[role=dialog], .overlay",
    expectText: "connect xrpl wallet",
    // The dialog contract below is NOT enforced here. XrplConnectModal lives in
    // wallet.tsx, which is out of scope to modify, and its gaps are already
    // measured and written up in docs/wallet-tsx-handoff.md: focus never enters
    // the dialog and Escape does not close it. Naming it keeps the check
    // meaningful for everything else instead of leaving the suite permanently
    // red on something nobody is allowed to fix.
    dialogContractWaived: "wallet.tsx — see docs/wallet-tsx-handoff.md" },
  // Unreachable in the current data: every vault is coming_soon or a showcase,
  // so depositDisabled is true everywhere and no accent CTA renders. Kept so the
  // summary keeps naming it rather than letting it vanish.
  { name: "vault:deposit",     route: "/vault/bess-belgrade-01", open: ".btn-accent", expect: "[role=dialog], .sheet, .overlay",
    expectText: "deposit", needsConnected: true,
    precondition: "needs a vault with status active — all six are coming_soon or showcase" },
  { name: "wallet:sheet",      route: "/",               open: ".wallet-pill",     expect: ".sheet-panel, [role=dialog]", needsConnected: true },
];

const AUDIT = String.raw`
const sel = SELECTOR;
// Pick the PANEL, not the scrim. .overlay is a fixed full-viewport backdrop, so
// measuring it makes "taller than the viewport" impossible by construction — it
// is always exactly the viewport. Prefer the inner dialog and fall back only if
// there isn't one.
const PANELS = ["[role=dialog]", ".modal", ".sheet-panel", ".ob-sheet", ".sheet"];
let panel = null;
for (const p of PANELS) { const e = document.querySelector(p); if (e && e.getClientRects().length) { panel = e; break; } }
const scrim = document.querySelector(".overlay, .scrim") || panel;
if (!panel) panel = document.querySelector(sel);
if (!panel) return { opened: false };
const panelSel = PANELS.find(p => panel.matches(p)) || sel;
const vw = window.innerWidth, vh = window.innerHeight;
const visible = (el) => el.getClientRects().length > 0;
const r = panel.getBoundingClientRect();

// Can everything in the panel be reached? Either the panel fits, or something
// scrolls — in its ancestry OR inside it.
//
// Descendants matter and were missed. Sheet puts its scroller in .sheet-body,
// a CHILD of the dialog, so walking only parentElement returned false for every
// sheet in the app. Measured on the Provably-fair sheet: ancestor-only false,
// descendant-aware finds ".sheet-body 715/628" — content that scrolls perfectly
// well. Nothing has misreported yet only because no control has happened to sit
// in the scrolled-out region; the moment one does, this flags a reachable
// button as UNREACHABLE and sends someone chasing a defect that is not there.
let scrollable = false;
for (let p = panel; p && p !== document.body; p = p.parentElement) {
  const cs = getComputedStyle(p);
  if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && p.scrollHeight > p.clientHeight + 1) { scrollable = true; break; }
  if (p.scrollHeight > p.clientHeight + 1 && cs.overflowY !== "visible") { scrollable = true; break; }
}
if (!scrollable) {
  for (const d of panel.querySelectorAll("*")) {
    const cs = getComputedStyle(d);
    if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && d.scrollHeight > d.clientHeight + 1) { scrollable = true; break; }
  }
}
// Body scrolling is IRRELEVANT once the panel sits inside a position: fixed
// ancestor — the page moves and the overlay does not. Crediting it is what made
// this audit pass a modal whose primary button was genuinely unreachable in
// landscape. Only count it when nothing in the chain is fixed.
let anyFixed = false;
for (let p = panel; p && p !== document.body; p = p.parentElement) {
  if (getComputedStyle(p).position === "fixed") { anyFixed = true; break; }
}
const bodyScrolls = !anyFixed &&
  document.body.scrollHeight > window.innerHeight + 1 &&
  getComputedStyle(document.body).overflow !== "hidden";

// Controls sitting below the fold
const below = [];
for (const el of [...(scrim||panel).querySelectorAll("button, a[href], input, select, textarea")].filter(visible)) {
  const b = el.getBoundingClientRect();
  if (b.bottom > vh + 1) below.push({ t: (el.textContent||"").trim().slice(0,26) || el.tagName, bottom: Math.round(b.bottom) });
}
const tiny = [];
for (const el of [...(scrim||panel).querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")].filter(visible)) {
  const b = el.getBoundingClientRect();
  if (b.width < 24 || b.height < 24) tiny.push({ t: (el.textContent||"").trim().slice(0,26) || el.tagName, size: Math.round(b.width)+"x"+Math.round(b.height) });
}
return {
  opened: true, panelSel,
  text: (panel.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
  vw, vh,
  panel: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) },
  overflowsRight: r.right > vw + 1,
  tallerThanViewport: r.height > vh + 1,
  scrollable, bodyScrolls,
  controlsBelowFold: below,
  tinyControls: tiny,
};
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
sweepStaleProfiles("ov-");
const PROFILE = mkdtempSync(join(tmpdir(), "ov-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, "--no-first-run",
  "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });

async function endpoint() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await sleep(150);
  }
  throw new Error("no endpoint");
}
class CDP {
  constructor(ws){ this.ws=ws; this.id=0; this.p=new Map(); this.w=[];
    ws.onmessage=(e)=>{ const m=JSON.parse(e.data);
      if(m.id!==undefined&&this.p.has(m.id)){const{res,rej}=this.p.get(m.id);this.p.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}
      else if(m.method) this.w=this.w.filter(x=>x.method!==m.method||(x.res(m.params),false)); }; }
  send(method,params={},sessionId){ const id=++this.id;
    return new Promise((res,rej)=>{this.p.set(id,{res,rej});this.ws.send(JSON.stringify({id,method,params,sessionId}));}); }
  once(method,t=25000){ return new Promise((res,rej)=>{const x={method,res};this.w.push(x);
    setTimeout(()=>{this.w=this.w.filter(y=>y!==x);rej(new Error("timeout "+method));},t);}); }
}
const connect=(u)=>new Promise((r,j)=>{const ws=new WebSocket(u);ws.onopen=()=>r(new CDP(ws));ws.onerror=()=>j(new Error("ws"));});

try {
  const b = await connect(await endpoint());
  const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  await s("Page.enable"); await s("Runtime.enable");
  if (asConnected) await s("Page.addScriptToEvaluateOnNewDocument", { source: CONNECTED_SEED }, sessionId);
  const ev = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.slice(0,120) || "eval threw");
    return r.result.value;
  };

  for (const w of WIDTHS) {
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: FORCE_H || HEIGHTS[w] || 800, deviceScaleFactor: 1, mobile: true });
    for (const c of CASES) {
      // Counted, not silently dropped. Skipping these without saying so is
      // how "every case ran at every width" printed under a run that had
      // quietly left both money-flow overlays out entirely.
      if (c.needsConnected && !asConnected) { gated.set(c.name, (gated.get(c.name) || 0) + 1); continue; }
      // Per-case seed, installed before navigation and removed after, so it
      // cannot leak into the next case and quietly change its result.
      let seedId = null;
      if (c.seed === "ROUND") {
        const res = await s("Page.addScriptToEvaluateOnNewDocument", { source: ROUND_SEED });
        seedId = res.identifier;
      }
      const loaded = b.once("Page.loadEventFired");
      const url = BASE + c.route + (c.route.includes("?") ? "" : "?onboarding=0");
      await s("Page.navigate", { url });
      await loaded; await sleep(c.seed ? 1600 : 800);
      if (c.open) {
        const clicked = await ev(`const t=document.querySelector(${JSON.stringify(c.open)}); if(!t) return false; t.focus(); t.click(); return true;`);
        if (!clicked) { skipped.set(c.name, (skipped.get(c.name) || 0) + 1); console.log(`  [${w}] ${c.name}: trigger not present — skipped`); continue; }
        await sleep(700);
      }
      let res;
      try { res = await ev(AUDIT.replace("SELECTOR", JSON.stringify(c.expect))); }
      catch (e) { console.log(`  [${w}] ${c.name}: ERROR ${e.message}`); continue; }
      if (!res.opened) { skipped.set(c.name, (skipped.get(c.name) || 0) + 1); console.log(`  [${w}] ${c.name}: did not open — skipped`); continue; }
      // Identity check. Measuring "a dialog opened" is not the same as measuring
      // THIS dialog, and the difference was three cases silently auditing the
      // wallet modal for as long as they have existed.
      if (c.expectText && !(res.text || "").toLowerCase().includes(c.expectText)) {
        skipped.set(c.name, (skipped.get(c.name) || 0) + 1);
        console.log(`  [${w}] ${c.name}: WRONG OVERLAY — expected ${JSON.stringify(c.expectText)}, got ${JSON.stringify((res.text || "").slice(0, 46))}`);
        if (seedId) await s("Page.removeScriptToEvaluateOnNewDocument", { identifier: seedId });
        continue;
      }
      const flags = [];
      if (res.overflowsRight) flags.push("OVERFLOWS-RIGHT");
      if (res.tallerThanViewport && !res.scrollable && !res.bodyScrolls) flags.push("TALLER-THAN-VIEWPORT-NO-SCROLL");
      if (res.controlsBelowFold.length && !res.scrollable && !res.bodyScrolls) flags.push(`UNREACHABLE(${res.controlsBelowFold.length})`);
      if (res.tinyControls.length) flags.push(`TINY(${res.tinyControls.length})`);
      console.log(`  [${w}] ${c.name.padEnd(20)} ${String(res.panelSel).padEnd(14)} ${String(res.panel.w).padStart(3)}x${String(res.panel.h).padStart(3)} vh=${res.vh} scroll=${res.scrollable||res.bodyScrolls}  ${flags.length ? "** " + flags.join(" ") : "ok"}`);
      for (const t of res.tinyControls) console.log(`         tiny: "${t.t}" ${t.size}`);
      for (const t of res.controlsBelowFold.slice(0,3)) console.log(`         below fold: "${t.t}" bottom=${t.bottom}`);

      // The dialog contract: focus goes in, Escape closes, focus comes back to
      // whatever opened it. A keyboard user who cannot get out of a dialog, or
      // who lands back at the top of the document after closing one, has lost
      // their place entirely — and none of it is visible in a screenshot, which
      // is why every other check here missed it.
      if (c.open) {
        // Tab containment first, because the Escape below closes the dialog.
        // Trusted key events, not dispatched ones: the browser moves focus in
        // response to real input, so a synthetic KeyboardEvent proves nothing
        // about tab order. Six presses is enough to leave any dialog here — the
        // largest has four focusable controls.
        let escaped = 0;
        for (let i = 0; i < 6; i++) {
          await s("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, code: "Tab", key: "Tab" });
          await s("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, code: "Tab", key: "Tab" });
          const inside = await ev(
            "const d=document.querySelector('[role=dialog], .modal, .ob-sheet, .sheet-panel');" +
            "return d ? d.contains(document.activeElement) : true;"
          );
          if (!inside) escaped++;
        }

        const f = await ev(
          "const t=document.querySelector(" + JSON.stringify(c.open) + ");" +
          "const d=document.querySelector('[role=dialog], .modal, .ob-sheet, .sheet-panel');" +
          "if(!t||!d) return null;" +
          "const inside=d.contains(document.activeElement);" +
          "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));" +
          "await new Promise(r=>setTimeout(r,700));" +
          "const closed=!document.querySelector('[role=dialog], .modal, .ob-sheet, .sheet-panel');" +
          "return { inside, closed, restored: document.activeElement===t };"
        );
        if (f) {
          const gaps = [];
          if (!f.inside) gaps.push("focus-not-trapped");
          if (escaped) gaps.push(`tab-escapes(${escaped}/6)`);
          if (!f.closed) gaps.push("escape-does-not-close");
          if (f.closed && !f.restored) gaps.push("focus-not-restored");
          if (gaps.length && c.dialogContractWaived)
            console.log(`         dialog contract: ${gaps.join(" ")} — waived (${c.dialogContractWaived})`);
          else if (gaps.length) {
            console.log(`  [${w}] ${c.name}: ** DIALOG CONTRACT ${gaps.join(" ")}`);
            process.exitCode = 1;
          }
        }
      }
      if (seedId) await s("Page.removeScriptToEvaluateOnNewDocument", { identifier: seedId });
    }
  }
  // A case that skips at EVERY width is not coverage, it is a gap that reads
  // like a passing line. spreadcast:fair has never run once: its trigger only
  // renders after a signed-in user commits a prediction, so the "Provably fair"
  // sheet has never been measured. Saying so at the end costs two lines and is
  // the difference between a known gap and an invisible one.
  const gatedNames = [...gated].filter(([, n]) => n === WIDTHS.length).map(([n]) => n);
  if (gatedNames.length) {
    console.log("");
    console.log(`not run without --as-connected: ${gatedNames.join(", ")}`);
  }
  const never = [...skipped].filter(([, n]) => n === WIDTHS.length).map(([n]) => n);
  if (never.length) {
    console.log("");
    console.log(`cases that never ran at any width: ${never.join(", ")}`);
    for (const n of never) {
      const c = CASES.find((x) => x.name === n);
      console.log(`  ${n} — trigger ${JSON.stringify(c && c.open)}${c && c.precondition ? " · " + c.precondition : ""}`);
    }
  } else {
    console.log("");
    console.log(gatedNames.length ? "every case that ran, ran at every width." : "every case ran at every width.");
  }
} catch (e) { console.log("fatal: " + e); process.exitCode = 1; }
finally { chrome.kill(); try {
    // maxRetries because kill() returns before Windows releases the
    // profile's file handles: the first version threw EPERM on a run whose
    // audit had already completed cleanly. And the catch because failing to
    // tidy up must never fail the audit — an unremoved directory is a
    // nuisance, a crashed sweep loses the result.
    rmSync(PROFILE, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  } catch (e) {
    console.error(`warn: left ${PROFILE} behind (${e.code}) — remove it if these accumulate`);
  } }
