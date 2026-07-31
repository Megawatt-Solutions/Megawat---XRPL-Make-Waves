# AI development guidelines — Megawatt

How to extend this product using AI coding agents without eroding what makes it credible.

**Audience:** anyone (human or agent) writing code here.
**Companion docs:** [`ui-ux-rehaul.md`](./ui-ux-rehaul.md) for the current UI/UX plan and brand token system.
**Last updated:** 2026-07-30

---

## 0. Read this first

Megawatt makes two claims that are easy to write and hard to earn:

1. **Real batteries.** Ljubljana and Metlika are operational BESS sites. The dashboards mirror real assets.
2. **Real market data.** Spreadcast settles against official European day-ahead prices (ENTSO-E A44), and commits predictions on-chain before the outcome exists.

Every AI-assisted change either strengthens or quietly corrodes those two claims. A fabricated number, a placeholder hash, or a chart bound to invented data does more damage here than a missing feature — because the entire pitch is *"this is not vapourware."*

**The one rule that matters:** never render data the system does not actually have.

---

## 1. Non-negotiables

### 1.1 Never fabricate data that looks real

Prohibited, in prod and demo paths alike:

- Fake transaction hashes, merkle roots, or XRPL addresses
- Made-up prices, spreads, yields, APYs, or capacity figures
- Placeholder leaderboard rows presented as real players
- A chart bound to `Math.random()` or a hardcoded array dressed as live data

If a surface needs data that no endpoint returns, you have exactly three honest options:

1. Don't build the surface
2. Build a reduced version that only uses data you have
3. Label it unmistakably as simulated — the codebase already does this (`SIMULATED-` tx prefix, `"SIMULATED FEED"` pill, `isDemo` on leaderboard rows). Follow that precedent.

> **Precedent to copy:** `/api/spreadcast/wallet` returns `note: "Prototype mode: address accepted without a Xaman signature."` when XUMM keys are absent. It tells the truth about its own limitations. Do that.

### 1.2 Respect the scope boundary you were given

This repo has had an explicit working rule: **design/structure/UI only — no backend, no web3 connectors.** If you are given a scope like that, it binds you *and* any tool you invoke.

**Consuming** an existing hook or endpoint is UI work. **Changing** one is not.

- ✅ Reading `useWallet()` in a component to decide what to render
- ✅ `fetch`ing an existing endpoint from a new presentational component
- ✅ Changing *which value* existing UI hands to an existing endpoint
- ❌ Editing `src/lib/wallet.tsx` so something fires on connect
- ❌ Adding a field to an API response, or a route under `api/`

**Verify after every session**, including sessions where a codemod or setup wizard ran on your behalf:

```powershell
$forbidden = @('web/src/app/api/','web/src/lib/spreadcast/','web/src/lib/wallet.tsx',
               'web/src/lib/xrpl.ts','worker/','contracts/','operator/')
$changed = git status --porcelain | ForEach-Object { ($_ -replace '^...','').Trim() }
$changed | Where-Object { $f = $_; $forbidden | Where-Object { $f -like "$_*" } }
```

Empty output = clean. **This has already caught a real violation** — the PostHog setup wizard edited `wallet.tsx` unprompted. Tools do not know your scope rules.

### 1.3 Never put wallet addresses into analytics as identifiers

An XRPL r-address is permanent, public, and cross-linkable across every chain and service. Making it the primary key in an analytics tool binds a person's entire product behaviour to their on-chain identity, forever, and is very likely personal data under GDPR for an EU company.

```js
posthog.identify(snap.address, { ... });   // ❌ never
posthog.identify(anonId, { via, funded }); // ✅ non-identifying properties only
```

Same applies to emails, and to `sc_session` if it is ever derived from either. See §5.

---

## 2. Brand and design system

The brand is **canonical and external** — it is not a matter of taste, and it is not defined by the code.

**Source of truth:** `https://www.megawatt.solutions/brand/` → `colors/colors.css` + `colors/tokens.json`, mirrored by the Figma Variables bundle in the Claude Design project.

| Token | Value | Rule |
|---|---|---|
| Megawatt Green | `#42E7AA` | accent, CTAs, brand moments — **~2% of any surface** |
| Carbon | `#030907` | near-black brand ink; the app canvas |
| Paper | `#FFFFFF` | light surfaces, inverted marks |
| Conduit Gray | `#737373` | secondary text, structural detail |
| Mist | `#F5F5F5` | dividers, hovers, secondary panels |

Radius scale is `6 / 10 / 16 / 999` — **there is no `0`**. Type base is 16px and body never goes below it. Eyebrows are 12px mono, weight 500, uppercase, `+0.16em`. Motion is one curve: `cubic-bezier(0.22, 1, 0.36, 1)`.

**Rules for agents:**

- **Never introduce a raw hex or `rgba()` in a component.** Use `var(--token)` or `color-mix(in srgb, var(--token) N%, transparent)`. The codebase was cleaned of 31 such literals; do not reintroduce them.
- **Canvas cannot resolve CSS variables.** Chart.js, and anything else drawing to `<canvas>`, must go through `src/lib/chartTheme.ts`. This is exactly how the charts silently drifted from the palette before.
- **The ~2% green budget is a real constraint.** If you add a saturated colour, you are spending the accent's budget. Status and band hues are deliberately held near 60% chroma.
- **Assign radius by object role, never by section** — controls `6px`, rows `10px`, surfaces `16px`, sheets `16px 16px 0 0`, pills `999px`.

---

## 3. Architecture conventions worth preserving

### One navigation root
The global `TopNav` (desktop bar + mobile tab bar) is the only navigation root. Sections may add a *section bar* beneath it — see `SectionBar.tsx` — but must never introduce a second bottom bar, a second wordmark, or a second identity. That combination is what makes an app feel like two apps stapled together.

### State that must not remount belongs in a layout
`RoundProvider` lives in `src/app/spreadcast/layout.tsx` so the countdown survives navigation between the four routes. If you add polling, a timer, or a websocket, ask whether route changes should reset it. Usually not — put it in the layout.

### Guard every fetch
Check `res.ok` **before** using the body. A 502 answers with `{ error }`, and casting that to your success type produces state that is truthy but structurally wrong — which is worse than null, because null checks pass. This exact bug white-screened `/spreadcast`.

```ts
if (!res.ok || !data || !data.expectedField) return setErr(data?.error ?? "…");
```

### Silent changes, and the `.sr-only` utility

There was no way to say something to a screen reader without also drawing it,
so anything that changed without moving pixels changed silently.

`.sr-only` uses `clip-path`, not `display:none` or `visibility:hidden` — both of
those remove the element from the accessibility tree, which is the opposite of
what it is for.

Two rules it exists to serve:

**A control that changes content must say what it changed.** The leaderboard's
scope and verified-only filters reload the table beneath them. Sighted that
reads as skeleton then rows; to a screen reader nothing happened, so the
controls appear inert. A `role="status"` region now reports "12 players, this
week, verified only". Polite, not assertive — it is the result of something the
user just did, not an interruption worth cutting across them for.

**A bare number is not a label.** The countdown was `07:13:29` in a span with a
`title`, which touch never shows and several readers skip. The digits are now
`aria-hidden` with a spoken equivalent beside them. Same for the streak chip,
which announced as "3".

⚠ Do **not** make the countdown a live region. It re-renders every second and
would talk over the whole page continuously. It reads when navigated to, which
is when the answer is wanted.

⚠ Check the placeholder state of anything you give spoken text to. Between
rounds the countdown is an em dash, and the first version of this announced
"dash until the next round opens". Speak the digits only when there are digits.

### If it looks like a heading, it has to be one

Four routes — `/`, `/portfolio`, `/marketplace`, `/dashboard-v2` — had **zero
headings of any level**. "Vaults", "Active vaults", "Fundraising", "Pipeline"
were all `<div className="section-title">`: styled to read as headings, and
invisible to the outline a screen reader navigates by. Those users had no way
to know what the page was or to jump between its sections.

Spreadcast, written later in this rehaul, used real headings throughout — the
same vaults↔Spreadcast seam the capitalisation pass found, showing up in the
document outline instead of in the copy.

`.page-title` is `<h1>`, `.section-title` is `<h2>`. Both reset `margin: 0`,
since the classes already set size and weight and only the browser's default
heading margins would have shifted the layout.

Related, same pass: multiple `<nav>` landmarks are on screen at once (main bar,
mobile tabs, Spreadcast's section bar). Unlabelled they all announce as
"navigation" and cannot be told apart — each now carries an `aria-label`. Table
headers carry `scope="col"`. The leaderboard's `#` column reads as "number
sign" without an `aria-label`, so it has one.

`runAudit()` now checks all of this (`no-h1`, `heading-level-skipped`,
`nav-landmark-unlabelled`, `th-no-scope`, `control-no-label`, `duplicate-id`).

⚠ It retries once before reporting a missing `h1`. A heading rendered after a
fetch resolves is genuinely absent at first paint, and reporting that is a lie
about the markup — `/spreadcast` tripped exactly this, reporting `no-h1` for a
page whose `h1` was present and visible a few hundred milliseconds later.

### A brand colour is specified against a surface — check which one

The brand's Conduit grey (`#737373`) is defined for secondary text. Measured
against the brand's own white paper it scores **4.74:1** — chosen, evidently,
to clear WCAG AA on a light page. Dropped unchanged onto the app's dark Carbon
canvas it scores 4.23, and on the card surfaces 3.86 and 3.56. All fail.

That was **238 pieces of text across nine routes** — every eyebrow, tile
subtitle, table header and timestamp. The entire secondary layer of the
interface, unreadable to anyone who needs contrast, and invisible to four
consecutive "0 findings" audits because layout correctness says nothing about
legibility.

The resolution is not to overrule the brand. `--mw-conduit` is unchanged and
still correct for light surfaces and for non-text detail (held to 3:1, which it
passes). What changed is that the dark canvas gets its own derivation of the
same neutral — same hue, no saturation, lifted until it clears 4.5:1.

**Solve for the lightest surface in the file, not the one you are looking at.**
A first attempt solved for `--card-2` and left the globe tooltip at 4.48,
because `--elevated` (`#16281f`) is lighter and was missed. The binding
constraint is whichever surface is lightest; today `--muted: #909090` clears
4.85 there and 6.29 on Carbon.

Contrast is now part of `runAudit()` (`contrast-below-aa`), measured once per
route since it does not vary with width. It resolves the real backdrop by
walking ancestors and compositing translucent layers — almost nothing here sets
its own opaque background, and measuring an element against its own transparent
one scores everything against black and passes everything.

### A component that returns `null` while loading will move the page

`return null` until data arrives is the most common way this codebase has
shifted layout. It reads as harmless and is invisible on localhost, where the
API answers in single-digit milliseconds. On a real connection the page paints,
then the component lands and shoves everything below it down.

`SpreadcastStrip` did exactly this on the home page: **212px on mobile, 154px on
desktop**, directly above the vault cards — so a thumb already reaching for a
card had the target move under it.

Three states, not two. `pending` is not `failed`:

- **pending** — reserve the space
- **ready** — render
- **failed** — collapse (rare, and one collapse beats a guaranteed jump)

Two rules for reserving it:

1. **Check what actually needs the data.** The strip's eyebrow, title and body
   were static strings; only the countdown was dynamic. It never needed to wait
   at all — paint immediately, fill the clock in. Prefer this over a skeleton.
2. **Reserve with the real markup, not a guessed height.** `VaultSpreadLine`
   wraps: 106px at 320, 81px at 390, 49px at 1280. Any single `min-height` is
   right at one width and wrong at every other, and it goes stale the moment
   the row gains a field. Render the same elements with placeholder text and
   `visibility: hidden` — it then wraps by exactly the same rules.

⚠ `PerformanceObserver({type:'layout-shift'})` reports **nothing** for a
cross-document iframe, so the audit harness cannot measure CLS. It will happily
report 0 for a page that jumps 212px. Measure by snapshotting element rects
before and after instead — and prove your instrument works with a deliberate
shift before you trust a zero.

### Every section gets an error boundary
`src/app/spreadcast/error.tsx` contains failures to that section, so the game cannot take the vaults half down. New sections that depend on an external service need the same.

### There is an automated responsive audit — run it

`web/public/__responsive-audit.html`. Open it against a running dev server and call:

```js
runAudit(["/", "/dashboard-v2", "/spreadcast"], [320, 360, 390, 430, 768, 1024, 1440]);
// then, once the HUD says done:
report();
```

It drives one iframe through every route at every width and reports document-level horizontal overflow, content clipped inside its own box, anything past the right edge, sub-36px tap targets, sub-9px text, and bottom-nav overlap. It ignores anything inside an intentional horizontal scroller, so scrollable tables don't show up as false positives.

**It is currently at zero findings. Keep it there.** If you change layout, re-run it before you commit.

It also validates every CSS declaration with `CSS.supports()` — ~2,400 of them — and reports `invalid-css-value` findings. That check exists because of a real incident: a bulk regex rewrite emitted `font-size:$114px` into 40 rules (.NET read `$1` + `14` as capture group 114 and wrote the literal text). **An invalid value is not a syntax error** — the browser silently drops the declaration and the element inherits instead. `next build` doesn't validate values, and the layout checks don't notice text that gets *larger* by inheritance, so those 40 dead rules survived **three consecutive clean audits**.

The lesson generalises: *a green check only covers what it measures.* When a whole class of defect is invisible to the harness, add the check rather than trusting the green.

⚠ Never run a bulk regex over CSS with a `$1`-style backreference immediately followed by digits. Use a `MatchEvaluator` callback instead:

```powershell
[regex]::Replace($t, 'pattern', { param($m) 'font-size: ' + $m.Groups[1].Value })
```

⚠ It lives in `public/`, which is served — so it is publicly reachable in production unless gated or deleted before deploy.

Sanity-check the detector occasionally by injecting a deliberately oversized element and confirming it flags; a zero that comes from a broken audit is worse than a number.

### Mobile is the target, and 360px is the test
Not 390. Chrome budget is already ~177px of an 844px viewport. `body { overflow-x: hidden }` means overflow **clips silently** rather than scrolling — a clipped primary control gives the user no signal that anything is missing. Test with same-origin iframes; media queries resolve against an iframe's own viewport:

```html
<iframe src="/spreadcast" width="360" height="700"></iframe>
```

---

## 4. Working with AI agents on this codebase

### Give the agent the constraint, not just the task
"Add a streak calendar" invites invention. "Add a streak calendar **using only fields `/api/spreadcast/round` already returns; if the data isn't there, say so and propose the honest alternative**" produces either a correct feature or a useful no.

### Make it verify, not assert
A typecheck is not verification of a visual change. Require, in order:

1. `npx tsc --noEmit`
2. `npm run build`
3. Actually look at it — a screenshot, or a live DOM probe of computed styles
4. The scope check in §1.2

Reading computed values off the running page catches what a diff cannot — that is how `.connect-btn` was found still square after a radius pass that "looked" complete, and how the 502px-in-360px header clip was found.

### Ask for the data audit first
Before building any surface, establish what the API actually returns. Most bad AI output on this codebase traces back to assuming a field exists. `/api/spreadcast/round` is unusually rich (`mine`, `latest`, `latest.mine.{correct,points,streak}`, `boundaries`) — most Spreadcast UI needs no new endpoint at all.

### Expect tools to violate your rules
Setup wizards, codemods and `npx` installers edit whatever they want. Run the scope check after any of them. Review their diffs specifically for: files outside your scope, credentials written to tracked files, and PII sent to third parties.

### Prefer a reduced honest feature over a complete dishonest one
A multiplier ladder with real streak data beats a calendar with invented days. This will come up repeatedly.

---

## 5. Analytics and privacy

PostHog is wired for **EU hosting** (`eu.i.posthog.com`) behind a `/ingest` reverse proxy. Keep both — EU residency matters for a German/Slovenian entity, and the proxy survives ad-blockers.

**Before enabling it in production:**

- [ ] **Never `identify()` with a wallet address or email.** Use PostHog's own anonymous id, or a random id you mint. Non-identifying properties (`via`, `funded`, `rlusd_trustline`) are fine.
- [ ] **Autocapture reads the text of clicked elements** — which includes the wallet pill and the Spreadcast account panel. Mask them: `data-ph-no-capture` on address-bearing nodes, `maskAllInputs: true` for session replay.
- [ ] **Decide on cookies.** `persistence: "memory"` is cookieless and avoids a consent banner entirely. A cookie banner in front of hackathon judges is a real cost.
- [ ] **Never send** amounts tied to an identified user, seeds, private keys, or session secrets.

Event naming: `noun_verb_past` (`wallet_connected`, `deposit_completed`, `marketplace_position_listed`). Keep property keys `snake_case`. `.posthog-events.json` is the registry — update it when you add events.

---

## 6. Definition of done

A change is done when:

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean
- [ ] Looked at on a real page, at 360px and at desktop
- [ ] Scope check (§1.2) empty
- [ ] No new raw hex or `rgba()` in components
- [ ] No fabricated data on any path
- [ ] `res.ok` checked on every new fetch
- [ ] Copy is specific and honest — no "Lorem", no invented statistics
- [ ] Secrets are in `web/.env` (gitignored), and `web/.env.example` lists any new key **by name only**

---

## 7. Known gaps — good next candidates

Recorded so future work starts informed rather than rediscovering:

| Gap | Note |
|---|---|
| No per-day history of a user's own results | Blocks a true streak calendar. Needs a backend change |
| No magic-link email auth | `/api/spreadcast/join` sets the session cookie instantly; don't ship a "check your inbox" screen |
| `/api/spreadcast/wallet` accepts an r-address with no signature | Self-documented as prototype mode. Production needs a Xaman sign-in payload |
| Wallet bind is one tap, not zero | Automatic bind on connect needs `src/lib/wallet.tsx` |
| `web/.env.example` is incomplete | Missing `SPREADCAST_API_URL`, `SPREADCAST_API_TOKEN`, `SESSION_SECRET`, `XRPL_ANCHOR_ADDRESS`. This directly caused a wasted debugging session |
| Brand guidelines PDF unread | `docsend.com/view/quvyymw2ctm37f5n` — may specify clear-space and spacing rules not captured here |
