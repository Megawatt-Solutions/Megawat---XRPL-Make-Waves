// Headless responsive audit — sweeps routes x viewport widths and reports
// geometry defects. No dependencies: Node 24 ships a global WebSocket and
// Chrome speaks the DevTools Protocol over one.
//
//   node scripts/responsive-audit.mjs                     # full sweep
//   node scripts/responsive-audit.mjs --widths 375,1280   # narrower sweep
//   node scripts/responsive-audit.mjs --canary            # prove the checks fire
//
// Why this exists: public/__responsive-audit.html holds a much richer set of
// checks but exposes them as window.runAudit() for a human with a console open,
// so nothing in it could ever run in a headless pass. Responsiveness was
// therefore argued from CSS reading rather than measured. This file is the
// smaller, automatable half — it answers "does anything overflow, clip, or come
// out below the minimum target size" across the whole matrix in one command.
//
// Requires a server on --base (default :3100). Prefer a production build:
// the dev server recompiles under a sustained sweep and the timings drift.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const flag = (n) => process.argv.includes(`--${n}`);

// Playwright's cache first (it is what this repo has), then the usual installs.
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const guesses = [
    join(home, "AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const hit = guesses.find(existsSync);
  if (hit) return hit;
  throw new Error("No Chrome found. Set CHROME_PATH, or: npx playwright install chromium");
}

const BASE = arg("base", "http://localhost:3100");
const ROUTES = arg("routes",
  "/,/dashboard-v2,/portfolio,/marketplace,/vault/bess-ljubljana-01," +
  "/vault/bess-belgrade-01,/spreadcast,/spreadcast/board,/spreadcast/log,/spreadcast/how," +
  // Failure pages are pages users reach, and no sweep had ever covered
  // them. The nested one matters most: a result URL is the thing here
  // built to be shared, so its dead links arrive from strangers.
  "/__not-found-probe,/spreadcast/result/__no-such-day"
).split(",");
// Common 2026 viewport widths: Android baseline, the iPhone cluster, tablets
// both orientations, and the laptop/desktop modes that dominate desktop traffic.
// --as-connected: reach the signed-in UI without touching wallet.tsx.
//
// The portfolio table, the vault position/claim cards and the marketplace sell
// picker are all gated on `connected` from useWallet(), so every sweep before
// this measured only the signed-out half of the app. wallet.tsx is out of scope
// to modify, but it restores its session from localStorage on load — so seeding
// the keys it already reads reaches the same state through the app's own
// mechanism, with no code change.
//
// Watch-only, and the address is the XRPL black-hole account: public, inert,
// belongs to nobody. It reads balances and signs nothing.
// --as-player: the states a committed player sees. Every sweep before this one
// measured Spreadcast as a visitor who has never played, so the fingerprint box,
// the lock CTA and the settlement banner had never been through the tap-target
// or geometry rules at all.
//
// What it does NOT reach, measured rather than assumed: the Xaman QR sub-state.
// That needs a click on "Lock on-chain", and this sweep never clicks — it loads
// a route and measures. Verified: with this seed, commitBox/settleBanner/
// lockButton are all present and cancelPresent/qrPresent are both false. The
// 41x18 "cancel" that prompted this seed therefore still lives outside it; it
// was found by hand and would need a click-driven pass to be caught again.
// Saying so beats implying coverage this does not have.
//
// String.raw is load-bearing: in a plain template literal a backslash is an
// escape, and an earlier version of this seed emitted "//api/..." — a line
// comment that threw silently and looked exactly like the state it was meant
// to replace.
const PLAYER_SEED = String.raw`(function(){
  const of = window.fetch;
  const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  window.fetch = async function(u, o){
    const url = typeof u === "string" ? u : (u && u.url) || "";
    if (url.indexOf("/api/spreadcast/commit-sign") !== -1) {
      return new Response(JSON.stringify({ uuid:"probe", qrPng: QR, deeplink:"https://xumm.app/sign/probe", status:"pending" }),
        { status:200, headers:{"content-type":"application/json"} });
    }
    const r = await of.apply(this, arguments);
    if (url.indexOf("/api/spreadcast/round") === -1) return r;
    const j = await r.clone().json().catch(function(){ return null; });
    if (!j || !j.open) return r;
    j.user = { id:"u1", email:"a@b.c", name:"probe", wallet:"rrrrrrrrrrrrrrrrrrrrrhoLvTp", verified:true };
    const h = "9f2c1a7b3e5d4f60a8c9b2d1e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f70";
    j.mine = { userId:"u1", day:j.open.day, band:2, exact:171.5, hash:h, txHash:null, correct:null };
    if (j.latest) j.latest.mine = { userId:"u1", day:j.latest.day, band:0, exact:120, hash:h,
      txHash:null, correct:false, streak:0, multiplier:1, points:0, absError:76.76 };
    return new Response(JSON.stringify(j), { status:200, headers:{"content-type":"application/json"} });
  };
})();`;

const CONNECTED_SEED =
  'localStorage.setItem("mw.xrplAddress","rrrrrrrrrrrrrrrrrrrrrhoLvTp");' +
  'localStorage.setItem("mw.xrplVia","watch");';

// Any route that lost its leading slash was rewritten by MSYS. On Git Bash an
// argument beginning with "/" is converted to a Windows path, so
// --routes "/no-such-page" arrives as "C:/Program Files/Git/no-such-page" and
// Page.navigate answers the useless "Cannot navigate to invalid URL". Fail with
// the cause instead of the symptom.
for (const r of ROUTES) {
  if (!r.startsWith("/")) {
    console.error(`Route ${JSON.stringify(r)} does not start with "/".`);
    console.error("On Git Bash, prefix the command with MSYS_NO_PATHCONV=1 — it rewrites leading slashes into Windows paths.");
    process.exit(2);
  }
}

const WIDTHS = arg("widths", "320,360,390,414,430,768,820,1024,1280,1440").split(",").map(Number);
// Portrait by width, plus the LANDSCAPE counterparts. Rotating a phone gives a
// short viewport, which is a different failure mode from a narrow one — it is
// how the connect modal was found stranding its primary button off-screen.
const HEIGHTS = { 320:658,360:800,375:812,390:844,414:896,430:932,768:1024,820:1180,1024:768,1280:800,1440:900,
                  658:320,732:412,800:360,844:390,896:414,932:430 };
const SETTLE = Number(arg("settle", 700));
const PORT = Number(arg("port", 9350));

// Each run gets a throwaway profile, so localStorage is always empty and the
// first-run onboarding sheet opens over EVERY route. The first version of this
// script therefore audited the modal on all 100 runs rather than the pages
// under it — the geometry findings still held, because elements behind a scrim
// keep their real boxes, but the pages were never actually seen in their normal
// state. ?onboarding=0 is the app's own supported suppression flag.
// Pass --with-onboarding to audit the sheet itself instead.
const suppress = !flag("with-onboarding");
const withFlag = (route) => {
  if (!suppress) return route;
  return route + (route.includes("?") ? "&" : "?") + "onboarding=0";
};

// ── the audit, stringified into the page ─────────────────────────────────
const CHECKS = String.raw`
const W = window.innerWidth;
const findings = [];
// Authoritative visibility test. getComputedStyle(child).display returns the
// child's OWN value inside a display:none parent — that mistake once produced
// five false accusations against nav links. Client rects are the truth.
const visible = (el) => el.getClientRects().length > 0;
const label = (el) => {
  const cls = (el.className && typeof el.className === "string")
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 34);
  return el.tagName.toLowerCase() + cls + (txt ? ' "' + txt + '"' : "");
};
// Laid out is not the same as seen. getClientRects() returns boxes for anything
// with geometry, including elements at opacity: 0 — and this app has six of
// them permanently in the DOM: the globe tooltips, which only fade in on hover
// or selection. They are positioned against a rotating globe, so they drift in
// and out of overflowing the viewport, and a geometry check that counts them
// fails intermittently on something nobody can see. Opacity is inherited
// visually, so an ancestor at 0 hides its children too.
const painted = (el) => {
  if (!el.getClientRects().length) return false;
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    if (parseFloat(cs.opacity) === 0) return false;
  }
  return true;
};
const all = [...document.querySelectorAll("body *")].filter(painted);
// An element inside overflow-x:auto is MEANT to exceed it — the vault table
// deliberately scrolls sideways below 641px. Flagging those is pure noise.
const inScroller = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ov = getComputedStyle(p).overflowX;
    if (ov === "auto" || ov === "scroll") return true;
  }
  return false;
};
for (const el of all) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) continue;
  if (r.right > W + 1 && !inScroller(el))
    findings.push({ kind: "overflows-viewport", el: label(el), detail: "right=" + Math.round(r.right) + " > " + W });
}
for (const el of all) {
  const cs = getComputedStyle(el);
  if (cs.overflowX !== "hidden" && cs.textOverflow !== "ellipsis") continue;
  if (!el.textContent || !el.textContent.trim()) continue;
  if (el.children.length > 2) continue;
  // Intentional clipping is not a defect, and it reports on every page:
  // .sr-only is clip-path'd to 1px so screen readers keep text sighted users
  // must not see, .chain-btn-name is clipped rather than display:none for the
  // same reason, and the odometer reels clip by design.
  if (el.closest(".odo-reel, .odo-strip, .sr-only, .chain-btn-name")) continue;
  if (cs.clipPath && cs.clipPath !== "none") continue;
  if (cs.position === "absolute" && el.clientWidth <= 1) continue;
  // scrollWidth vs clientWidth, not border boxes: a border-box comparison is
  // blind to inline content spilling inside a block, and reported 0 across 27
  // pairs while a real clip was live.
  if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
    findings.push({ kind: "clipped-text", el: label(el), detail: "scroll=" + el.scrollWidth + " client=" + el.clientWidth });
}

// ── text sitting underneath something that paints over it ─────────────────
// The blind spot the other checks share: an out-of-flow element takes no space,
// so nothing overflows and nothing clips when it lands on a label. A tile icon
// landing on its own label was found by eye, not by any check, after a layout
// change pushed the label into a band that had always been empty.
const alpha = (c) => {
  let m = (c || "").match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return p.length > 3 ? p[3] : 1; }
  m = (c || "").match(/color\(\s*srgb\s+([^)]+)\)/);
  if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return p.length > 3 ? p[3] : 1; }
  return 0;
};
// Absolute only. A fixed bar is positioned against the VIEWPORT and page content
// scrolling beneath it is what the bar is for; measured at one scroll offset
// that reads as dozens of collisions with the phone tab bar. What matters here
// is decoration positioned against a COMPONENT.
const overlays = all.filter((el) => {
  const cs = getComputedStyle(el);
  if (cs.position !== "absolute") return false;
  const r = el.getBoundingClientRect();
  // A scrim spanning the page is doing its job, not colliding with it.
  if (r.width * r.height > innerWidth * innerHeight * 0.6) return false;
  if (r.width < 4 || r.height < 4) return false;
  return alpha(cs.backgroundColor) > 0.05 || el.tagName === "IMG" || !!el.querySelector("svg, img");
});
const clashed = new Set();
for (const el of all) {
  if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
  // Glyph bounds, not the block's box: a full-width label's BOX always sits
  // under a right-aligned icon, while its letters usually do not.
  const rg = document.createRange();
  rg.selectNodeContents(el);
  const glyphs = [...rg.getClientRects()].filter((g) => g.width > 1 && g.height > 1);
  if (!glyphs.length) continue;
  const elPositioned = getComputedStyle(el).position !== "static";
  // Effective z, not the element's own. z-index lives on whichever ancestor
  // establishes the stacking context, so comparing the two leaf elements said a
  // tile icon (z auto) painted over the phone tab bar's labels — when
  // .bottom-nav carries z-index: 60 and is plainly on top. In landscape, where
  // the viewport is short enough for a tile to sit under the bar, that produced
  // three confident findings about text nobody is covering.
  const effZ = (n) => {
    let z = 0;
    for (let p = n; p && p !== document.documentElement; p = p.parentElement) {
      const v = Number(getComputedStyle(p).zIndex);
      if (!Number.isNaN(v) && v > z) z = v;
    }
    return z;
  };
  const zEl = effZ(el);
  for (const ob of overlays) {
    if (ob === el || ob.contains(el) || el.contains(ob)) continue;
    const o = ob.getBoundingClientRect();
    const zOb = effZ(ob);
    // Paint order, not document order: a positioned element paints above
    // in-flow content whatever the source order, and StatTile emits its icon
    // BEFORE the label — a document-order test saw nothing on the very case
    // this check exists for.
    const onTop = zOb > zEl || (zOb === zEl && !elPositioned) ||
      (zOb === zEl && elPositioned && (el.compareDocumentPosition(ob) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    if (!onTop) continue;
    for (const g of glyphs) {
      const ox = Math.min(g.right, o.right) - Math.max(g.left, o.left);
      const oy = Math.min(g.bottom, o.bottom) - Math.max(g.top, o.top);
      if (ox > 2 && oy > 2) {
        const key = label(el) + "|" + label(ob);
        if (!clashed.has(key)) {
          clashed.add(key);
          findings.push({ kind: "text-under-overlay", el: label(el),
            detail: label(ob) + " covers " + Math.round(ox) + "x" + Math.round(oy) });
        }
        break;
      }
    }
  }
}

// Text can spill out of a box that is itself perfectly in bounds. Inherited
// white-space: nowrap did that to two paragraphs in the expanded archive day —
// one ran 536px inside a 266px cell, off the side of a 320px phone. Every other
// check in this file measures ELEMENT boxes, so not one of them could see it.
// Range rects measure the text instead.
//
// Union of the rects, not the widest one: a paragraph built from JSX
// interpolations is many text nodes, and the widest single rect of the hourly
// caption read 137px against a real line of 419px — which is how this sat
// unnoticed through every prior pass.
for (const el of all) {
  if (el.children.length) continue;
  if (!(el.textContent || "").trim()) continue;
  if (inScroller(el)) continue;
  // Deliberate truncation clips, it does not spill. ellipsis needs overflow
  // hidden, so anything not visible here opted out of overflowing.
  if (getComputedStyle(el).overflowX !== "visible") continue;
  const rng = document.createRange();
  rng.selectNodeContents(el);
  const rects = [...rng.getClientRects()].filter((r) => r.height > 0);
  if (!rects.length) continue;
  const textRight = Math.max(...rects.map((r) => r.right));
  const box = el.getBoundingClientRect();
  if (textRight > box.right + 2)
    findings.push({ kind: "text-overflows-box", el: label(el),
      detail: Math.round(textRight - box.right) + "px past its own box" });
}

const CTRL = "a[href], button, [role=button], input:not([type=hidden]), select, textarea";
for (const el of [...document.querySelectorAll(CTRL)].filter(visible)) {
  const r = el.getBoundingClientRect();
  if (r.width < 24 || r.height < 24)
    findings.push({ kind: "tap-target<24", el: label(el), detail: Math.round(r.width) + "x" + Math.round(r.height) });
}
return { width: W, horizontalPageOverflow: document.documentElement.scrollWidth > W + 1, findings };
`;

// Three-state canary: silent -> fires on a forced defect -> silent again.
const CANARY = String.raw`
const W = window.innerWidth;
const visible = (el) => el.getClientRects().length > 0;
// Must carry the SAME scroller filter as the real check. Without it the canary
// counts the 46 elements inside the deliberately side-scrolling vault table and
// reports a baseline of 46 on a page that is clean — the assertion still holds,
// because it is relative, but the number printed next to it is a lie.
const inScroller = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ov = getComputedStyle(p).overflowX;
    if (ov === "auto" || ov === "scroll") return true;
  }
  return false;
};
const run = () => {
  let overflow = 0, tiny = 0, spill = 0;
  for (const el of [...document.querySelectorAll("body *")].filter(visible)) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && r.right > W + 1 && !inScroller(el)) overflow++;
  }
  for (const el of [...document.querySelectorAll("a[href], button")].filter(visible)) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) tiny++;
  }
  for (const el of [...document.querySelectorAll("body *")].filter(visible)) {
    if (el.children.length || !(el.textContent || "").trim()) continue;
    if (inScroller(el) || getComputedStyle(el).overflowX !== "visible") continue;
    const rng = document.createRange();
    rng.selectNodeContents(el);
    const rects = [...rng.getClientRects()].filter((r) => r.height > 0);
    if (rects.length && Math.max(...rects.map((r) => r.right)) > el.getBoundingClientRect().right + 2) spill++;
  }
  return { overflow, tiny, spill };
};
const baseline = run();
const wide = document.createElement("div");
wide.style.cssText = "width:2000px;height:20px";
document.body.appendChild(wide);
const small = document.createElement("button");
small.style.cssText = "width:8px;height:8px";
document.body.appendChild(small);
// A narrow box whose text cannot wrap — the exact shape of the archive-day
// paragraph and the 0-width status cell. Its own box stays well inside the
// viewport, so the overflow counter above must NOT move for it: that is the
// whole point of the check, and if this canary ever bumps both counters the
// new check is measuring nothing the old one did not already catch.
const spilled = document.createElement("p");
spilled.style.cssText = "width:20px;white-space:nowrap;overflow:visible";
spilled.textContent = "text far wider than twenty pixels";
document.body.appendChild(spilled);
const defect = run();
wide.remove(); small.remove(); spilled.remove();
const restored = run();
return { baseline, defect, restored,
  overflowCheckFires: defect.overflow > baseline.overflow && restored.overflow === baseline.overflow,
  tapCheckFires: defect.tiny === baseline.tiny + 1 && restored.tiny === baseline.tiny,
  spillCheckFires: defect.spill === baseline.spill + 1 && restored.spill === baseline.spill };
`;

// ── minimal CDP client ───────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) {
        this.waiters = this.waiters.filter((w) => {
          if (w.method !== m.method) return true;
          w.resolve(m.params); return false;
        });
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  once(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const w = { method, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error("timeout waiting for " + method));
      }, timeout);
    });
  }
}

const connect = (u) => new Promise((res, rej) => {
  const ws = new WebSocket(u);
  ws.onopen = () => res(new CDP(ws));
  ws.onerror = (e) => rej(new Error("ws: " + e.message));
});

const chrome = spawn(findChrome(), [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "resp-audit-"))}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

async function endpoint() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("Chrome never exposed a debugging endpoint");
}

let exitCode = 0;
try {
  const browser = await connect(await endpoint());
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  await s("Page.enable");
  if (flag("as-connected")) await s("Page.addScriptToEvaluateOnNewDocument", { source: CONNECTED_SEED }, sessionId);
  if (flag("as-player")) await s("Page.addScriptToEvaluateOnNewDocument", { source: PLAYER_SEED }, sessionId);
  await s("Runtime.enable");

  const evaluate = async (body) => {
    const res = await s("Runtime.evaluate", {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true, returnByValue: true,
    });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || "eval threw");
    return res.result.value;
  };
  const goto = async (url) => {
    const loaded = browser.once("Page.loadEventFired", 25000);
    await s("Page.navigate", { url });
    await loaded;
    await sleep(SETTLE);
  };

  if (flag("canary")) {
    await s("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await goto(BASE + withFlag("/dashboard-v2"));
    const c = await evaluate(CANARY);
    console.log(JSON.stringify(c, null, 2));
    if (!c.overflowCheckFires || !c.tapCheckFires || !c.spillCheckFires) {
      console.error("\nCANARY FAILED — the checks do not detect a defect they are given.");
      exitCode = 1;
    } else {
      console.error("\ncanary ok: silent at baseline, fired on a forced defect, silent again.");
    }
  } else {
    const rows = [];
    for (const w of WIDTHS) {
      await s("Emulation.setDeviceMetricsOverride", { width: w, height: HEIGHTS[w] || 900, deviceScaleFactor: 1, mobile: w < 768 });
      for (const route of ROUTES) {
        try {
          await goto(BASE + withFlag(route));
          rows.push({ route, w, ...(await evaluate(CHECKS)) });
        } catch (e) {
          rows.push({ route, w, error: String(e) });
        }
      }
      process.stderr.write(`  width ${w} ✓\n`);
    }

    const errors = rows.filter((r) => r.error);
    const overflowPages = rows.filter((r) => r.horizontalPageOverflow);
    const uniq = new Map();
    for (const r of rows) {
      for (const f of r.findings || []) {
        const k = `${f.kind}|${f.el}|${r.route}`;
        if (!uniq.has(k)) uniq.set(k, { ...f, route: r.route, widths: [r.w] });
        else uniq.get(k).widths.push(r.w);
      }
    }

    console.log(`\nruns: ${rows.length}   errors: ${errors.length}`);
    console.log(`pages with horizontal overflow: ${overflowPages.length}`);
    console.log(`unique findings: ${uniq.size}\n`);
    for (const e of errors) console.log(`  ERROR ${e.route} @${e.w}: ${e.error}`);
    for (const f of [...uniq.values()].sort((a, b) => b.widths.length - a.widths.length)) {
      console.log(`  [${f.kind}] ${f.route}`);
      console.log(`      ${f.el}`);
      console.log(`      ${f.detail}  @ ${f.widths.join(", ")}`);
    }
    if (!uniq.size && !errors.length && !overflowPages.length) console.log("  clean.");
    if (uniq.size || errors.length || overflowPages.length) exitCode = 1;
  }
} catch (err) {
  console.error(String(err));
  exitCode = 1;
} finally {
  chrome.kill();
  process.exit(exitCode);
}
