// Minimal Chrome DevTools Protocol driver — no dependencies.
//
// The playwright MCP server hangs in this environment (it hung with no browser
// installed AND after chromium was installed, so it is the server, not the
// browser). Node 24 ships a global WebSocket, and Chrome speaks CDP over one,
// so driving the browser directly is both simpler and fully under our control.
//
//   node cdp.mjs --url http://localhost:3100/ --width 375 --height 812 \
//                --eval audit.js [--shot out.png] [--settle 900]
//
// --eval's file must evaluate to an expression (it is wrapped in an async IIFE
// and the completion value is returned by value).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The same resolution the five audit scripts use. This file used to hardcode
// one developer's Windows playwright path, which made it the only script in
// scripts/ that could not run on a Mac or in CI — it threw ENOENT on spawn
// before doing anything, while `npm run audit` beside it worked fine.
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

const CHROME = findChrome();

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
}

const url = arg("url");
const width = Number(arg("width", 1280));
const height = Number(arg("height", 900));
const settle = Number(arg("settle", 900));
const evalFile = arg("eval");
const shot = arg("shot");
const port = Number(arg("port", 9333));


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
sweepStaleProfiles("cdp-");
const profile = mkdtempSync(join(tmpdir(), "cdp-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw new Error("chrome did not expose a debugging endpoint");
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) {
        this.waiters = this.waiters.filter((w) => {
          if (w.method !== m.method) return true;
          w.resolve(m.params);
          return false;
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
        reject(new Error(`timeout waiting for ${method}`));
      }, timeout);
    });
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => resolve(new CDP(ws));
    ws.onerror = (e) => reject(new Error("ws error: " + e.message));
  });
}

try {
  const browserWs = await endpoint();
  const browser = await connect(browserWs);

  // Own page target, attached flat so one socket carries the session.
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  const s = (method, params) => browser.send(method, params, sessionId);

  await s("Page.enable");
  await s("Runtime.enable");
  const media = arg("media");   // e.g. prefers-reduced-motion=reduce
  if (media) {
    const [name, value] = media.split("=");
    await s("Emulation.setEmulatedMedia", { features: [{ name, value }] });
  }
  await s("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
  });

  // Runs before any page script — the only way to seed storage the app reads
  // during its own initialisation.
  const init = arg("init");
  if (init) await s("Page.addScriptToEvaluateOnNewDocument", { source: init });

  const loaded = browser.once("Page.loadEventFired");
  await s("Page.navigate", { url });
  await loaded;
  await sleep(settle);

  let out = null;
  if (evalFile) {
    const src = readFileSync(evalFile, "utf8");
    const res = await s("Runtime.evaluate", {
      expression: `(async () => { ${src} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      out = { error: res.exceptionDetails.exception?.description || "eval threw" };
    } else {
      out = res.result.value;
    }
  }

  // A scroll lock can only be tested with TRUSTED input. window.scrollTo() is
  // programmatic and overflow:hidden never blocks it, so an in-page probe
  // reports "background scrolls" on a page that is correctly locked. A wheel
  // dispatched through the Input domain is real input and settles it.
  // --tab N: press Tab N times as REAL input and report where focus lands each
  // time. Synthetic KeyboardEvents do not move focus at all — the browser moves
  // focus itself in response to trusted input, so a dispatched event proves
  // nothing about tab order or about whether a dialog contains it. Same reason
  // --wheel exists for scroll locks.
  const tabs = arg("tab");
  if (tabs) {
    const describe =
      "(() => { const a = document.activeElement; if (!a) return 'null';" +
      " const d = document.querySelector('[role=dialog], .modal, .ob-sheet, .sheet-panel');" +
      " const inside = d ? d.contains(a) : null;" +
      " const cls = typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\s+/)[0] : '';" +
      " const txt = (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 22);" +
      " return (inside === null ? '' : inside ? 'IN  ' : 'OUT ') + a.tagName + cls + (txt ? ' \"' + txt + '\"' : ''); })()";
    const stops = [];
    for (let i = 0; i < Number(tabs); i++) {
      await s("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, code: "Tab", key: "Tab" });
      await s("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, code: "Tab", key: "Tab" });
      await sleep(90);
      stops.push((await s("Runtime.evaluate", { expression: describe, returnByValue: true })).result.value);
    }
    out = { ...(out ?? {}), tabStops: stops };
  }

  const wheel = arg("wheel");
  if (wheel) {
    const readY = async () =>
      (await s("Runtime.evaluate", { expression: "window.scrollY", returnByValue: true })).result.value;
    const y0 = await readY();
    await s("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: Math.round(width / 2), y: Math.round(height / 2),
      deltaX: 0, deltaY: Number(wheel), pointerType: "mouse",
    });
    await sleep(500);
    const y1 = await readY();
    out = { ...(out ?? {}), wheel: { before: y0, after: y1, backgroundScrolled: y1 !== y0 } };
  }

  if (shot) {
    const { data } = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(shot, Buffer.from(data, "base64"));
  }

  console.log(JSON.stringify(out ?? { ok: true }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err) }));
  process.exitCode = 1;
} finally {
  chrome.kill();
  // Remove the throwaway profile. Leaving it behind filled the disk: 714 of
  // these at ~14MB each, 9.8GB, until no tool could open a file for writing.
  try {
    // maxRetries because kill() returns before Windows releases the
    // profile's file handles: the first version threw EPERM on a run whose
    // audit had already completed cleanly. And the catch because failing to
    // tidy up must never fail the audit — an unremoved directory is a
    // nuisance, a crashed sweep loses the result.
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  } catch (e) {
    console.error(`warn: left ${profile} behind (${e.code}) — remove it if these accumulate`);
  }
}
