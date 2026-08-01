// Accessibility audit — contrast, structure, focus, naming — across routes.
// No dependencies: Node 24 has a global WebSocket and Chrome speaks CDP.
//
//   node scripts/a11y-audit.mjs                 # all checks, all routes
//   node scripts/a11y-audit.mjs --canary        # prove each check can fail
//   node scripts/a11y-audit.mjs --tab-order     # walk the real Tab sequence
//   node scripts/a11y-audit.mjs --widths 390    # one width
//
// Companion to responsive-audit.mjs (geometry) and overlay-audit.mjs (sheets
// and modals). Requires a server on --base; prefer a production build.
//
// Every suppression and parser quirk below was paid for by a false result.
// They are load-bearing — read the comments before removing one.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const flag = (n) => process.argv.includes(`--${n}`);

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
const ROUTES = arg("routes",
  "/,/dashboard-v2,/portfolio,/marketplace,/vault/bess-ljubljana-01," +
  "/vault/bess-belgrade-01,/spreadcast,/spreadcast/board,/spreadcast/log,/spreadcast/how," +
  // Failure pages are pages users reach, and no sweep had ever covered
  // them. The nested one matters most: a result URL is the thing here
  // built to be shared, so its dead links arrive from strangers.
  "/__not-found-probe,/spreadcast/result/__no-such-day"
).split(",");
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

const WIDTHS = arg("widths", "390,1280").split(",").map(Number);
const PORT = Number(arg("port", 12600));
const SETTLE = Number(arg("settle", 800));

// The first-run onboarding sheet opens over every route on a fresh profile, so
// without this the audit measures the modal instead of the page.
const withFlag = (r) => r + (r.includes("?") ? "&" : "?") + "onboarding=0";

// ── shared colour maths, injected into every check ────────────────────────
const COLOUR = String.raw`
// TWO notations. Missing the second reported 30 contrast failures that did not
// exist: every color-mix() in this stylesheet computes to
// "color(srgb 0.49 0.65 0.85 / 0.08)", never to rgba(). An rgba-only regex
// reads all of them as "no colour", i.e. as an invisible control.
const parse = (c) => {
  if (!c) return null;
  let m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
           return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  m = c.match(/color\(\s*srgb\s+([^)]+)\)/);
  if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
           return { r: p[0]*255, g: p[1]*255, b: p[2]*255, a: p.length > 3 ? p[3] : 1 }; }
  return null;
};
const over = (s, d) => ({ r: s.r*s.a + d.r*(1-s.a), g: s.g*s.a + d.g*(1-s.a), b: s.b*s.a + d.b*(1-s.a), a: 1 });
function bgOf(el, skipSelf) {
  let acc = null;
  for (let p = skipSelf ? el.parentElement : el; p; p = p.parentElement) {
    const bg = parse(getComputedStyle(p).backgroundColor);
    if (!bg || bg.a === 0) continue;
    acc = acc === null ? bg : over(acc, bg);
    if (bg.a >= 1) break;
  }
  return acc && acc.a >= 1 ? acc : over(acc || { r:0,g:0,b:0,a:0 }, { r:0,g:0,b:0,a:1 });
}
const lum = (c) => { const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// getComputedStyle(child).display returns the CHILD's own value inside a
// display:none parent — that mistake once produced five false accusations.
// Client rects are the truth.
const visible = (el) => el.getClientRects().length > 0;
const label = (el) => {
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0,2).join(".") : "";
  return el.tagName.toLowerCase() + (cls ? "." + cls : "");
};
`;

const CHECKS = COLOUR + String.raw`
const findings = [];

// ── 1.4.3 text contrast ───────────────────────────────────────────────────
let textChecked = 0;
for (const el of [...document.body.querySelectorAll("*")].filter(visible)) {
  const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length;
  if (!own) continue;
  const cs = getComputedStyle(el);
  const fg = parse(cs.color);
  if (!fg || fg.a === 0) continue;
  // skipSelf FALSE. Text sits on its own element's background; only a BORDER
  // sits against the parent's. Copying the non-text-contrast call here reported
  // "Connect Wallet" at 1.00:1 — dark text measured against the dark page
  // instead of against the bright green button it is actually painted on.
  const bg = bgOf(el, false);
  const composited = fg.a < 1 ? over(fg, bg) : fg;
  const px = parseFloat(cs.fontSize);
  const large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
  const need = large ? 3 : 4.5;
  textChecked++;
  const r = ratio(composited, bg);
  if (r < need) findings.push({ kind: "text-contrast", el: label(el), detail: r.toFixed(2) + ":1 needs " + need,
    text: (el.textContent || "").trim().slice(0, 30) });
}

// ── 1.4.11 non-text contrast ──────────────────────────────────────────────
// Operable controls only. 1.4.11 governs "user interface components" — things
// you can act on — and graphical objects. A status pill (.badge) states its
// status in words, and .chain-btn is a non-interactive <span> showing which
// network you are on; their colour is redundant with their text, which 1.4.3
// already covers. Including them produced 20 findings per run that no one
// should act on, which is how an audit stops being read.
const CTRL = "button, a.btn, input:not([type=hidden]), select, textarea, [role=button]";
let ctrlChecked = 0, textOnly = 0;
for (const el of [...document.querySelectorAll(CTRL)].filter(visible)) {
  const r0 = el.getBoundingClientRect();
  if (r0.width < 4 || r0.height < 4) continue;
  const cs = getComputedStyle(el);
  const surround = bgOf(el, true);
  let best = 0, via = "none";
  // EVERY side. .site-row carries its boundary on border-bottom and
  // .seg-btn.active on border-left; a top-only read called both unbounded.
  // A border only counts as the control's BOUNDARY when it encloses it. One
  // side is a divider or an underline, not an outline: .seg-btn's border-left
  // separates it from the next segment (the .seg group draws the real boundary,
  // in --border-control which was solved for 3:1), and .site-row's
  // border-bottom is a row rule. Reporting those as failing boundaries asks the
  // design to outline every list row.
  const sides = ["Top","Right","Bottom","Left"].filter(sd =>
    (parseFloat(cs["border"+sd+"Width"]) || 0) >= 1 && cs["border"+sd+"Style"] !== "none");
  if (sides.length >= 3) {
    for (const side of sides) {
      const bc = parse(cs["border"+side+"Color"]);
      if (!bc || bc.a === 0) continue;
      const c = ratio(bc.a < 1 ? over(bc, surround) : bc, surround);
      if (c > best) { best = c; via = "border-" + side.toLowerCase(); }
    }
  }
  const ownBg = parse(cs.backgroundColor);
  if (ownBg && ownBg.a > 0) {
    const c = ratio(ownBg.a < 1 ? over(ownBg, surround) : ownBg, surround);
    if (c > best) { best = c; via = "fill"; }
  }
  // box-shadow is a boundary too, and omitting it made this blind to the app's
  // own idiom: both .seg-btn.active and .sc-seg button.on mark themselves with
  // an inset accent underline. Without this the check called a state
  // marked at 11:1 a 1.19:1 failure, because it only looked at fill and border.
  const shadow = (cs.boxShadow || "").match(/(rgba?\([^)]+\)|color\(srgb[^)]+\))/);
  if (shadow) {
    const sc = parse(shadow[1]);
    if (sc && sc.a > 0) {
      const c = ratio(sc.a < 1 ? over(sc, surround) : sc, surround);
      if (c > best) { best = c; via = "box-shadow"; }
    }
  }
  // A control with no fill and no border is identified by its TEXT, and 1.4.3
  // covers that. 1.4.11 does not require a boundary the design never drew.
  if (via === "none") { textOnly++; continue; }
  ctrlChecked++;
  if (best < 3) findings.push({ kind: "non-text-contrast", el: label(el), detail: best.toFixed(2) + ":1 via " + via,
    text: (el.textContent || "").trim().slice(0, 30) });
}

// ── 2.4.7 focus visibility ────────────────────────────────────────────────
const SIG = ["outlineStyle","outlineWidth","outlineColor","outlineOffset","boxShadow","borderColor","borderWidth","backgroundColor","color"];
const sig = (el) => { const cs = getComputedStyle(el); return SIG.map(p => cs[p]).join("|"); };
const FOCUSABLE = "a[href], button, [role=button], input:not([type=hidden]), select, textarea, [tabindex='0']";
let focusChecked = 0;
const active = document.activeElement;
for (const el of [...document.querySelectorAll(FOCUSABLE)].filter(visible)) {
  const before = sig(el);
  try { el.focus({ preventScroll: true }); } catch { continue; }
  if (document.activeElement !== el) continue;
  const after = sig(el);
  el.blur();
  focusChecked++;
  if (before === after) findings.push({ kind: "no-focus-indicator", el: label(el),
    detail: "computed style unchanged on focus", text: (el.textContent || "").trim().slice(0, 30) });
}
if (active && active.focus) try { active.focus({ preventScroll: true }); } catch {}

// ── naming: icon-only controls, and single characters carrying meaning ─────
const accName = (el) => {
  const al = el.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
  const lb = el.getAttribute("aria-labelledby");
  if (lb) { const t = lb.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || "").join(" ").trim(); if (t) return t; }
  const sr = el.querySelector(".sr-only"); if (sr && sr.textContent.trim()) return sr.textContent.trim();
  return (el.textContent || "").trim() || null;
};
for (const el of [...document.querySelectorAll("button, a[href], [role=button]")].filter(visible)) {
  if ((el.textContent || "").trim()) continue;
  if (!el.querySelector("svg, img")) continue;
  if (!accName(el)) findings.push({ kind: "icon-control-unnamed", el: label(el), detail: "no accessible name", text: "" });
}
// A single letter is a picture of a word — "V" for Verified. It walks past any
// icon check because it IS text. Skipped when the element sits in a NAMED
// group (a labelled range selector makes "1W" self-evident), or when it is a
// number, a unit or a placeholder dash.
for (const el of [...document.querySelectorAll("body *")].filter(visible)) {
  const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join("");
  if (!own || own.length > 2 || el.children.length) continue;
  if (el.getAttribute("aria-hidden") === "true" || el.closest("[aria-hidden=true], .sr-only")) continue;
  if (/^[$€£¥]?[\d.,]+%?$/.test(own) || /^[—–\-·•|/,.:%+$€£]+$/.test(own)) continue;
  if (el.getAttribute("aria-label") || el.getAttribute("role") || el.getAttribute("title")) continue;
  if (el.closest("[role=group][aria-label], [role=radiogroup][aria-label]")) continue;
  // A unit or currency directly after a number reads fine ("16.1 MW").
  const ptxt = el.parentElement?.textContent || "";
  const at = ptxt.indexOf(own);
  if (at > 0 && /[\d)]\s*$/.test(ptxt.slice(0, at))) continue;
  findings.push({ kind: "unnamed-glyph", el: label(el), detail: "text is " + JSON.stringify(own),
    text: (el.parentElement?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) });
}

// ── structure ─────────────────────────────────────────────────────────────
const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")].filter(visible)
  .map(el => ({ level: Number(el.getAttribute("aria-level")) || Number(el.tagName[1]) || 2,
                text: (el.textContent || "").trim() }));
const h1s = heads.filter(h => h.level === 1).length;
if (h1s === 0) findings.push({ kind: "no-h1", el: "document", detail: "", text: "" });
if (h1s > 1) findings.push({ kind: "multiple-h1", el: "document", detail: String(h1s), text: "" });
let prev = 0;
for (const h of heads) {
  if (!h.text) findings.push({ kind: "empty-heading", el: "h" + h.level, detail: "", text: "" });
  if (prev && h.level > prev + 1) findings.push({ kind: "skipped-heading-level", el: "h" + h.level,
    detail: "h" + prev + " -> h" + h.level, text: h.text.slice(0, 30) });
  prev = h.level;
}
if (!document.querySelector("main, [role=main]")) findings.push({ kind: "no-main-landmark", el: "document", detail: "", text: "" });
if (!document.querySelector("header, [role=banner]")) findings.push({ kind: "no-banner-landmark", el: "document", detail: "", text: "" });
const navs = [...document.querySelectorAll("nav, [role=navigation]")];
if (navs.length > 1) {
  const unnamed = navs.filter(n => !n.getAttribute("aria-label") && !n.getAttribute("aria-labelledby")).length;
  if (unnamed) findings.push({ kind: "unnamed-nav", el: "nav", detail: unnamed + " of " + navs.length, text: "" });
  const names = navs.map(n => n.getAttribute("aria-label") || "").filter(Boolean);
  if (new Set(names).size !== names.length) findings.push({ kind: "duplicate-nav-name", el: "nav", detail: names.join(" | "), text: "" });
}
const skip = document.querySelector("a[href^='#']");
if (skip) { const id = skip.getAttribute("href").slice(1);
  if (id && !document.getElementById(id)) findings.push({ kind: "skip-target-missing", el: "a.skip-link", detail: "#" + id, text: "" }); }
const pos = [...document.querySelectorAll("[tabindex]")].filter(e => Number(e.getAttribute("tabindex")) > 0).length;
if (pos) findings.push({ kind: "positive-tabindex", el: "document", detail: String(pos), text: "" });

return { counts: { textChecked, ctrlChecked, textOnlyExempt: textOnly, focusChecked }, findings };
`;

// Three states per check: silent, fires on a forced defect, silent again.
const CANARY = COLOUR + String.raw`
const count = (fn) => { let n = 0; for (const el of [...document.body.querySelectorAll("*")].filter(visible)) if (fn(el)) n++; return n; };
const lowText = () => count(el => {
  const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).length;
  if (!own) return false;
  const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg || fg.a === 0) return false;
  const bg = bgOf(el, false); const px = parseFloat(cs.fontSize);
  const need = (px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight,10) >= 700)) ? 3 : 4.5;
  return ratio(fg.a < 1 ? over(fg, bg) : fg, bg) < need;
});
const noFocus = () => {
  let n = 0;
  const SIG = ["outlineStyle","outlineWidth","outlineColor","boxShadow","borderColor","backgroundColor","color"];
  const sig = (el) => SIG.map(p => getComputedStyle(el)[p]).join("|");
  for (const el of [...document.querySelectorAll("a[href],button")].filter(visible)) {
    const b = sig(el); try { el.focus({ preventScroll: true }); } catch { continue; }
    if (document.activeElement !== el) continue;
    const a = sig(el); el.blur(); if (b === a) n++;
  }
  return n;
};
const badHeads = () => { let n = 0, prev = 0;
  for (const el of [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible)) {
    const l = Number(el.tagName[1]); if (prev && l > prev + 1) n++; prev = l; } return n; };

const base = { text: lowText(), focus: noFocus(), heads: badHeads() };

const s1 = document.createElement("style");
s1.textContent = "p,span,div,h1,h2,a{color:#3a3a3a !important} *:focus,*:focus-visible{outline:none !important;box-shadow:none !important;background-color:inherit !important}";
document.head.appendChild(s1);
const probe = document.createElement("h4"); probe.textContent = "forced skip";
(document.querySelector("main") || document.body).appendChild(probe);
const broke = { text: lowText(), focus: noFocus(), heads: badHeads() };
s1.remove(); probe.remove();
const back = { text: lowText(), focus: noFocus(), heads: badHeads() };

return { base, broke, back, fires: {
  textContrast: broke.text > base.text && back.text === base.text,
  focusVisible: broke.focus > base.focus && back.focus === base.focus,
  headingOrder: broke.heads > base.heads && back.heads === base.heads,
} };
`;

// ── CDP glue ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.w = [];
    ws.onmessage = (e) => { const m = JSON.parse(e.data);
      if (m.id !== undefined && this.p.has(m.id)) { const { res, rej } = this.p.get(m.id); this.p.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method) this.w = this.w.filter(x => x.method !== m.method || (x.res(m.params), false)); }; }
  send(method, params = {}, sessionId) { const id = ++this.id;
    return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params, sessionId })); }); }
  once(method, t = 25000) { return new Promise((res, rej) => { const x = { method, res }; this.w.push(x);
    setTimeout(() => { this.w = this.w.filter(y => y !== x); rej(new Error("timeout " + method)); }, t); }); }
}
const connect = (u) => new Promise((r, j) => { const ws = new WebSocket(u); ws.onopen = () => r(new CDP(ws)); ws.onerror = () => j(new Error("ws")); });

const chrome = spawn(findChrome(), ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "a11y-"))}`, "--no-first-run",
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
  await s("Page.enable");
  if (flag("as-connected")) await s("Page.addScriptToEvaluateOnNewDocument", { source: CONNECTED_SEED }, sessionId); await s("Runtime.enable");

  const ev = async (src) => {
    const r = await s("Runtime.evaluate", { expression: `(async () => { ${src} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.slice(0, 160) || "eval threw");
    return r.result.value;
  };
  const goto = async (url) => { const l = b.once("Page.loadEventFired"); await s("Page.navigate", { url }); await l; await sleep(SETTLE); };

  if (flag("tab-order")) {
    // 2.4.3. el.focus() proves an element CAN take focus; it says nothing about
    // the sequence a keyboard user actually gets. This dispatches real Tab keys.
    // String.raw, not a plain template. In an ordinary template literal \s is an
    // unrecognised escape and collapses to "s", so /\s+/g silently became /s+/g
    // — it replaced the LETTER s. The symptom was letters disappearing from the
    // output: "Vilnius" read as "Vilniu", ".skip-link" as ".kip-link".
    const DESC = String.raw`(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { none: true };
      const r = a.getBoundingClientRect();
      const cls = typeof a.className === "string" ? a.className.trim().split(/\s+/).slice(0,2).join(".") : "";
      return { tag: a.tagName.toLowerCase(), cls,
        text: (a.textContent || "").trim().replace(/\s+/g," ").slice(0,26) || a.getAttribute("aria-label") || "",
        // DOCUMENT y. Tab scrolls the page, so a viewport-relative reading
        // shrinks as you move DOWN the document — that reported four order
        // violations on a long page which were purely scrolling.
        docY: Math.round(r.top + window.scrollY),
        // 2px, not 1. Focusing an element below the fold scrolls it flush with
        // the viewport edge, and sub-pixel rounding lands it a fraction over —
        // measured bottom=901 against innerHeight=900. Three vault cards were
        // reported as focused off-screen on that single pixel.
        onScreen: r.top >= -2 && r.bottom <= window.innerHeight + 2 && r.width > 0,
        inBottomNav: !!a.closest(".bottom-nav"),
        hidden: r.width === 0 && r.height === 0,
        // Exact identity, by marking the node itself. A string key of
        // tag+class+text cannot tell the two charts' "1W" buttons apart and
        // ended the walk 24 stops early; including position instead breaks on
        // position:fixed elements, whose document offset moves as you scroll.
        repeat: a.dataset.tabseen === "1" ? true : (a.dataset.tabseen = "1", false) };
    })()`;
    for (const w of WIDTHS) {
      await s("Emulation.setDeviceMetricsOverride", { width: w, height: w < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 768 });
      for (const route of ROUTES) {
        await goto(BASE + withFlag(route));
        await ev("document.body.focus(); window.scrollTo(0,0); return true;");
        const seq = []; let cycled = -1;
        for (let i = 0; i < 80; i++) {
          for (const t of ["rawKeyDown", "keyUp"])
            await s("Input.dispatchKeyEvent", { type: t, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
          // 220ms, not 45. Focus styles and the skip link's reveal animate over
          // 0.15s; sampling mid-transition reported the skip link as focused
          // while off-screen, which it is not once it lands.
          // scroll-behavior: smooth means focus scrolling ANIMATES; sampling
          // before it lands reports elements as focused off-screen when they
          // are on their way in. 420ms clears both that and the 0.15s reveal.
          await sleep(420);
          const d = (await s("Runtime.evaluate", { expression: DESC, returnByValue: true })).result.value;
          if (d.none) continue;
          if (d.repeat) { cycled = i; break; }
          seq.push(d);
        }
        const ghosts = seq.filter(x => x.hidden);
        const off = seq.filter(x => !x.hidden && !x.onScreen);
        const jumps = [];
        for (let i = 1; i < seq.length; i++)
          if (!seq[i-1].hidden && !seq[i].hidden && seq[i].docY < seq[i-1].docY - 60)
            jumps.push(`${seq[i-1].tag}.${seq[i-1].cls}@${seq[i-1].docY} -> ${seq[i].tag}.${seq[i].cls}@${seq[i].docY}`);
        // Report tab-bar reachability explicitly: reordering the DOM to fix
        // focus order must never orphan the five destinations it contains.
        const inBar = seq.filter(x => x.inBottomNav).length;
        const bad = ghosts.length || off.length || jumps.length;
        console.log(`  [${w}] ${route.padEnd(26)} ${String(seq.length).padStart(3)} stops` +
          (cycled >= 0 ? " (cycles)" : " (NO CYCLE)") +
          (inBar ? `  tabbar=${inBar}` : "") +
          (bad ? `  ** ghosts=${ghosts.length} offscreen=${off.length} jumps=${jumps.length}` : "  ok"));
        for (const g of ghosts) console.log(`        tabbable but 0x0: ${g.tag}.${g.cls} "${g.text}"`);
        for (const o of off) console.log(`        focused off-screen: ${o.tag}.${o.cls} "${o.text}"`);
        for (const j of jumps) console.log(`        order jump: ${j}`);
        if (bad || cycled < 0) exitCode = 1;
      }
    }
  } else if (flag("canary")) {
    await s("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await goto(BASE + withFlag("/dashboard-v2"));
    const c = await ev(CANARY);
    console.log(JSON.stringify(c, null, 2));
    const ok = Object.values(c.fires).every(Boolean);
    console.error(ok ? "\ncanary ok: every check went silent -> fired -> silent."
                     : "\nCANARY FAILED — a check cannot detect the defect it is given.");
    if (!ok) exitCode = 1;
  } else {
    const rows = [];
    for (const w of WIDTHS) {
      await s("Emulation.setDeviceMetricsOverride", { width: w, height: w < 768 ? 844 : 900, deviceScaleFactor: 1, mobile: w < 768 });
      for (const route of ROUTES) {
        try { await goto(BASE + withFlag(route)); rows.push({ route, w, ...(await ev(CHECKS)) }); }
        catch (e) { rows.push({ route, w, error: String(e) }); }
      }
      process.stderr.write(`  width ${w} ✓\n`);
    }
    const totals = rows.reduce((a, r) => {
      if (!r.counts) return a;
      for (const k of Object.keys(r.counts)) a[k] = (a[k] || 0) + r.counts[k];
      return a;
    }, {});
    const uniq = new Map();
    for (const r of rows) for (const f of r.findings || []) {
      const k = `${f.kind}|${f.el}|${f.detail}|${r.route}`;
      if (!uniq.has(k)) uniq.set(k, { ...f, route: r.route, widths: [r.w] });
      else uniq.get(k).widths.push(r.w);
    }
    const errors = rows.filter(r => r.error);
    console.log(`\nruns: ${rows.length}   errors: ${errors.length}`);
    console.log(`text nodes: ${totals.textChecked || 0}   bounded controls: ${totals.ctrlChecked || 0}` +
                `   text-only exempt: ${totals.textOnlyExempt || 0}   focusable: ${totals.focusChecked || 0}`);
    console.log(`unique findings: ${uniq.size}\n`);
    for (const e of errors) console.log(`  ERROR ${e.route} @${e.w}: ${e.error}`);
    for (const f of [...uniq.values()].sort((a, b) => a.kind.localeCompare(b.kind))) {
      console.log(`  [${f.kind}] ${f.route}  ${f.el}`);
      console.log(`      ${f.detail}${f.text ? `  "${f.text}"` : ""}  @ ${f.widths.join(", ")}`);
    }
    if (!uniq.size && !errors.length) console.log("  clean.");
    if (uniq.size || errors.length) exitCode = 1;
  }
} catch (e) { console.error(String(e)); exitCode = 1; }
finally { chrome.kill(); process.exit(exitCode); }
