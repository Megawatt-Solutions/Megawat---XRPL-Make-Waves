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
import { mkdtempSync } from "node:fs";
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

// name, route, selector to click (null = already open), selector that should appear
const CASES = [
  { name: "onboarding",        route: "/?onboarding=1",  open: null,               expect: ".ob-sheet, [role=dialog]" },
  { name: "spreadcast:fair",   route: "/spreadcast",     open: ".sc-commit-why",   expect: "[role=dialog], .sheet" },
  { name: "marketplace:sell",  route: "/marketplace",    open: ".btn-accent",      expect: "[role=dialog], .sheet, .overlay" },
  { name: "wallet:connect",    route: "/",               open: ".connect-btn",     expect: "[role=dialog], .overlay" },
  { name: "vault:deposit",     route: "/vault/bess-belgrade-01", open: ".btn-accent", expect: "[role=dialog], .sheet, .overlay" },
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
// in its ancestry scrolls.
let scrollable = false;
for (let p = panel; p && p !== document.body; p = p.parentElement) {
  const cs = getComputedStyle(p);
  if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && p.scrollHeight > p.clientHeight + 1) { scrollable = true; break; }
  if (p.scrollHeight > p.clientHeight + 1 && cs.overflowY !== "visible") { scrollable = true; break; }
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
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "ov-"))}`, "--no-first-run",
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
  const ev = async (expr) => {
    const r = await s("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.slice(0,120) || "eval threw");
    return r.result.value;
  };

  for (const w of WIDTHS) {
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: FORCE_H || HEIGHTS[w] || 800, deviceScaleFactor: 1, mobile: true });
    for (const c of CASES) {
      const loaded = b.once("Page.loadEventFired");
      const url = BASE + c.route + (c.route.includes("?") ? "" : "?onboarding=0");
      await s("Page.navigate", { url });
      await loaded; await sleep(800);
      if (c.open) {
        const clicked = await ev(`const t=document.querySelector(${JSON.stringify(c.open)}); if(!t) return false; t.click(); return true;`);
        if (!clicked) { console.log(`  [${w}] ${c.name}: trigger not present — skipped`); continue; }
        await sleep(700);
      }
      let res;
      try { res = await ev(AUDIT.replace("SELECTOR", JSON.stringify(c.expect))); }
      catch (e) { console.log(`  [${w}] ${c.name}: ERROR ${e.message}`); continue; }
      if (!res.opened) { console.log(`  [${w}] ${c.name}: did not open — skipped`); continue; }
      const flags = [];
      if (res.overflowsRight) flags.push("OVERFLOWS-RIGHT");
      if (res.tallerThanViewport && !res.scrollable && !res.bodyScrolls) flags.push("TALLER-THAN-VIEWPORT-NO-SCROLL");
      if (res.controlsBelowFold.length && !res.scrollable && !res.bodyScrolls) flags.push(`UNREACHABLE(${res.controlsBelowFold.length})`);
      if (res.tinyControls.length) flags.push(`TINY(${res.tinyControls.length})`);
      console.log(`  [${w}] ${c.name.padEnd(20)} ${String(res.panelSel).padEnd(14)} ${String(res.panel.w).padStart(3)}x${String(res.panel.h).padStart(3)} vh=${res.vh} scroll=${res.scrollable||res.bodyScrolls}  ${flags.length ? "** " + flags.join(" ") : "ok"}`);
      for (const t of res.tinyControls) console.log(`         tiny: "${t.t}" ${t.size}`);
      for (const t of res.controlsBelowFold.slice(0,3)) console.log(`         below fold: "${t.t}" bottom=${t.bottom}`);
    }
  }
} catch (e) { console.log("fatal: " + e); process.exitCode = 1; }
finally { chrome.kill(); }
