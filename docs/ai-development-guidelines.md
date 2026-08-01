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

### The most important qualifier cannot be the last thing read

Ljubljana and Metlika are `kind: "showcase"` — real sites Megawatt operates,
published so the performance behind its numbers can be checked, and **not
investable**. The page handled this carefully in places: the yield tile says
"Gross yield / On capex / yr" rather than APY, and there is no deposit control.

But the sentence that says the quiet part — "Not an investable vault" — lived in
the *last card of the sidebar*, which on mobile stacks below everything else.
Measured: the 12.2% headline sits at y=207 and that sentence sat at **y=3144**,
roughly 3.7 phone screens further down, in 12px muted text. Someone arriving
from a shared link read a full page of yield, revenue and capacity figures
before learning none of it was buyable.

The header pill now reads **"Showcase site · not investable"** instead of
"Operated by Megawatt" — 268px from the top, above every stat tile. The operator
detail moved into Site overview, where it was always the less urgent half.

On a page that shows money, the qualifier belongs beside the number it
qualifies. If a disclosure only works when someone scrolls, it does not work.

### Audit the signed-out state — it is what a new visitor sees

Every route was only ever audited signed **in**, because the dev browser has
`mw.xrplAddress` in localStorage. That is not what a first-time visitor gets,
and on several routes it is a completely different render tree — `/portfolio`
returns an entirely different component.

Clear `mw.xrplAddress` and `mw.xrplVia`, reload, and re-run. **Save and restore
them**: that is the developer's own origin, not a fixture.

⚠ And confirm the state actually changed before believing a clean result — check
for `.connect-btn` and the absence of `.wallet-pill`. A signed-out sweep that
quietly ran signed-in reports zero findings just as convincingly.

### RESOLVED: the dev server degrades under sweep load

The overlay pass found the connect dialog when run on its own and reported zero
inside a full sweep. Four hypotheses about the harness were wrong. It was the
**environment**.

The evidence that settled it: on a **freshly restarted** dev server,
`auditOverlays(390)` completes in 58s and finds the 189×31 button. Run the same
code against a server that has just absorbed 77 route loads and it hangs or
returns nothing — and by then even a standalone call fails, which is what
finally gave it away. Early in a session it worked; late in the same session,
identical code did not.

That explains every observation at once: standalone-early works, a 2-route
sweep works, the full 77-combination sweep does not, and the overlay pass is
the victim because it runs **last**.

**So: restart the dev server, then call `auditOverlays(390)`.** It is not part
of `runAudit()` and should not be — it needs a server that has not just been
hammered. `runAudit()` emits `overlays-not-audited-here` on every run so the gap
is in the output rather than in a document nobody opens.

The general lesson is the one this whole loop keeps relearning: **when a check
disagrees with itself, suspect the harness and its environment before the
code.** Four rounds were spent on polling, hydration, swallowed errors and
stale documents — all plausible, all wrong — because the failure looked like a
logic bug. The tell was that the standalone path degraded *during* the session,
which no logic bug does.

### (historical) the four dead ends

`auditOverlays(390)` called on its own reports
`small-tap-target 189x31` for the connect dialog, reliably, three runs in a row.
`runAudit()` over 2 routes × 1 width reports it too. `runAudit()` over the full
11 routes × 7 widths reports **zero**.

Four hypotheses tried and none of them was it:

1. *Fixed waits too short under load* — added `waitForOverlay()` polling. No change.
2. *Opener not hydrated when queried* — added `waitFor()` for the opener too. No change.
3. *A thrown error being swallowed* — there was a real `ReferenceError: d is not
   defined` from removing a binding, and the harness surfaced it as
   `overlay-audit-error` rather than a silent zero, which is the behaviour it
   should have. Fixed, and still zero.
4. *Stale document from a reused URL* — made `load()` cache-bust every call.
   **Reverted:** it turns every page into a cache miss and the overlay pass went
   from seconds to minutes. Not worth it, and it did not fix the zero either.

**What instrumenting the full sweep did establish** — every entry logged
`found: true` for both its opener and its overlay, then the pass returned zero.
So the dialog *is* being opened; the failure is inside `audit()` not seeing the
button once it is there. That rules out the entire "cannot reach the modal"
family and is where the next attempt should start.

Kept as a record of what a wrong diagnosis looks like. A check that silently
reports clean is worse than one that is absent, because absence is visible and
a false zero is not — which is why `runAudit()` now announces the gap instead
of quietly passing.

### A finding that appears in some runs is worse than one that never appears

The overlay pass reached the connect dialog only by luck. On `/marketplace` the
primary button opens the **Sell form** when a signing wallet is attached and the
**connect dialog** when one is not — and only the second contains the 189×31
"Use a watch-only address instead" button. So the same sweep reported the
finding one run and zero the next, depending on what happened to be in
localStorage.

Zero that depends on which state you landed in is worse than no check at all: it
looks earned. `OVERLAYS` now has a `signedOut: true` entry that clears the wallet
keys, reloads, audits, and restores them in a `finally`. Verified deterministic
across three consecutive runs, and verified the wallet is byte-identical
afterwards.

⚠ **Every `load()` needs a distinct URL.** Assigning `iframe.src` its current
value does not reliably fire `onload`, so the promise never settles and the
sweep hangs with no error at all. The first version of `withSignedOut` loaded
the same route twice and did exactly that — and because it hung *inside* the
`try`, the `finally` never ran and it left the dev session signed out. A `finally`
only protects you from throws, not from hangs. The route is cache-busted with a
counter now.

### There was no skip link

WCAG 2.4.1 Bypass Blocks is **Level A** — the base tier — and it was missing
entirely. Measured before the fix:

| route | tabs before page content |
|---|---|
| `/` | 7 |
| `/portfolio` | 7 |
| `/spreadcast` | 11 (the section bar adds four) |

The same nav repeats on every route, so a keyboard user paid that toll on every
navigation, forever.

The link is first in the document, off-screen until focused (`display: none`
cannot be focused, which would defeat it), pinned to the **viewport** so it
appears wherever the user is, at `z-index: 100` — above `.nav` (50) and
`.bottom-nav` (60), because the one thing worse than no skip link is one that
appears underneath the bar it exists to skip.

Its target is a wrapper in `layout.tsx`, not each page's own `<main>`, so it
works regardless of what a route renders and no page has to remember to opt in.
The wrapper carries `tabIndex={-1}` — **without it the jump moves the scroll
position but not focus**, so the next Tab resumes from the nav and the link
appears to do nothing.

`runAudit()` now checks all three failure modes: `no-skip-link`,
`skip-link-target-missing`, `skip-link-target-not-focusable`.

⚠ It checks **structurally**, not by focusing the link. An unfocused document
never matches `:focus`, so a visibility test would always fail and would be
measuring the harness rather than the page — see below.

### `:focus` needs the document to actually have focus

Verifying the skip link produced two false failures in a row, both mine:

1. In the audit iframe, `document.hasFocus()` is `false`, so `element.matches(':focus')`
   returns `false` even when the element **is** `document.activeElement`. The
   `:focus` styles never applied and the link looked broken.
2. In the real tab, with focus genuinely held, I read `getComputedStyle`
   immediately after `.focus()` — before the 150ms transition had run — and read
   the *start* of the animation as the final state.

With real focus and a 500ms wait it slides to `top: 8`, is fully in the
viewport, and lands focus on `#main-content`.

This is the same root cause as the `:focus-visible` false positive from the
focus-ring pass. Anything involving `:focus`, `:focus-visible`, transforms or
transitions has to be verified in a focused document, after the animation, or
by screenshot.

### The audit now reports 1 finding, and that is correct

`small-tap-target · button · 189x31` on the Sell/connect overlay. It is the
"Use a watch-only address instead" button at `lib/wallet.tsx:290`, out of scope
for this rehaul and written up in [`wallet-tsx-handoff.md`](./wallet-tsx-handoff.md).

Earlier sweeps reported zero. That was not because the app was clean — it was
because the tap-target check exempted `display: inline` controls, and this
button happens to be styled inline. Narrowing that exemption made a real defect
visible. **A count that goes up after a check is fixed is the check working.**

Leave it reporting until the button is fixed. Suppressing a true finding to keep
a zero is how a suite becomes decorative.

### Type is set in px, so it ignores the user's font-size setting

**147 CSS declarations plus 88 inline in TSX use `px` for `font-size`. Two use
anything relative.** `body` hardcodes `16px`, which overrides the user's own
default.

Browser **zoom** still scales px, so this is not a WCAG 1.4.4 failure. What it
misses is the other control — a raised default font size, which only rem/em type
responds to. Users who need larger text and reach for that setting rather than
zoom get **no change at all**, and they are the group least likely to know zoom
exists.

**Not migrated, and the reason is a boundary rather than a judgement call.**
Seven of those declarations are in `lib/wallet.tsx`. Converting the other 228
would leave the connect modal as the only text in the app that ignores the
setting — a permanent inconsistency baked into a 235-declaration rewrite of
every text size in the product. That is not a change to make autonomously.

`auditTextScale(routes, width)` exists in the harness for whoever takes it on.
It is deliberately **not** part of `runAudit()`: it would report a known and
accepted state on every run, and a check that always fails teaches people to
skip the output. Run it during the migration, not before.

⚠ Its first version filtered **for** `overflow: visible` when looking for
clipped text — which is the one value that cannot clip. It reported two elements
that render perfectly well. Clipping needs `hidden`/`clip`/`scroll`/`auto`. It
also now diffs against the same measurement at the default root size, so
pre-existing overflow is not blamed on the text scale.

### Audit the states the demo data cannot reach

No vault in `vaults.ts` is `fundraising` or `active` — all six are `showcase`
or `coming_soon`. So the deposit flow, the claim flow and the marketplace
listings have **never been rendered by any sweep**, and a whole branch of the
UI was unexamined.

You can reach them without shipping a lie: flip one vault locally, audit, and
`git checkout --` the file in the same pass. Testing is not the same as
asserting a fact about a real asset — but the revert is not optional, and
confirm it (`git status`) rather than assuming.

Doing that found `--gray` still pointing at Conduit `#737373` while carrying
**Carbon text** in a `.segbar` segment:

| segment | ratio |
|---|---|
| green | 12.66:1 |
| amber | 10.07:1 |
| blue | 8.13:1 |
| **grey** | **4.23:1** |

The lone failure, and not close. The earlier contrast pass left `--gray` alone
on the reasoning that it was a status dot held to the 3:1 non-text bar. It is a
dot *and* a text-bearing surface, and only the second use fails. Now `#8a8a8a`,
which also improves the dot.

### An exemption is a place findings go to hide

The tap-target check skipped `display: inline` controls, so a link inside a
sentence would not be flagged for having the line's height. Sound rule, too
broad in practice: it let a **189×31** "Use a watch-only address" button pass
as clean, because that button happens to be styled inline.

A control is only genuinely inline if its parent has text around it. On its own
it is a button that happens to be styled inline, and a thumb does not care about
the display property. The check now tests for sibling text before exempting.

⚠ That control is at `lib/wallet.tsx:290`, inside the file ruled out of scope —
so it is reported, not fixed. Whoever owns that file should give it a real hit
area. **When a rule exempts something, check what it is actually letting
through** — every audit before this one called that modal clean.

### Every media query keyed off width

There was not a single `max-height` query in `globals.css`. Nothing had ever
considered viewport *height*, and a phone rotated to landscape is about 390px
tall.

Measured there: 58px nav + 44px section bar + 75px tab bar = **177px, or 45% of
the screen** on `/spreadcast`, leaving 213px for the page — most of which is
then the page head. The app was being read through a letterbox and no
width-keyed sweep could ever have shown it.

The fix keeps the tab bar fixed — it is the primary navigation on mobile and
removing it to win 75px costs more than it saves — and **releases the brand
bar** instead. It carries a wordmark and a wallet pill, neither of which needs
to be present at every scroll position while the tabs always are. Released, not
hidden: still at the top of the document, it just stops following. The section
bar then sticks to the viewport top rather than to 58px, which would otherwise
pin it below a bar that is no longer there.

45% → 26% on `/spreadcast`, 34% → 15% on the home page, tab targets still 49px,
portrait completely unchanged.

`runAudit()` now sweeps two landscape geometries and raises
`chrome-eats-short-viewport` past a third of the screen. Canaried by restoring
the sticky nav: reproduces 41% and fires.

⚠ Overlay `getBoundingClientRect()` in this harness reports the pre-animation
transform — a bottom-anchored sheet reads as `translateY(100%)`, fully
off-screen, **even seconds after it has settled**. This has now produced a false
alarm three separate times, including one that looked exactly like a real
landscape bug. Screenshot before believing that a sheet is off-screen. Element
*heights* are reliable; positions and transforms are not.

### The audit only saw what was open

For most of this rehaul every check ran against a route with everything closed.
Sheets, modals and onboarding were never audited at all — and they were hiding
real defects the whole time:

- **The Sell modal overflowed 56px past the right edge at 390px.** `.overlay` is
  a grid, and an `auto` track sizes to its content's max-content width — so
  `.modal { width: 440px }` made the track 440px, and its own `max-width: 100%`
  then resolved against *that* and constrained nothing. `grid-template-columns:
  minmax(0, 1fr)` bounds the track to the container, which is what `100%` was
  always meant to mean. 431px → 328px.
- **The two lightest surfaces in the app are only reachable inside overlays.**
  `--sheet` and `--toast` sit above `--elevated`, so the contrast fix from the
  previous pass was still short: `--muted` scored 4.44 in an open Sheet.
- The close X was an 18×27 tap target and "Max" was 32×19, both inline-styled
  with no padding, in a dialog where a mis-tap dismisses your work.

`runAudit()` now opens each overlay and runs contrast, layout **and** semantics
against it. Entries whose opener is missing are skipped rather than failed —
the connect modal only exists when no wallet is attached, and the audit must
not depend on demo state.

⚠ **Do not fix a small tap target with a negative margin.** Cancelling the added
padding keeps the row from growing but pushes the button past its parent's
content edge, which is real overflow — it showed up immediately as
`clipped-content` on `.modal-title` and `.field-label`. Let the row grow; a
modal header can afford 44px. (This is the second time that shortcut has been
tried and caught in this project.)

### `scrollWidth > clientWidth` is not clipping

The `clipped-content` rule was **inverted**. It excluded `overflow-x: hidden` —
the one value that actually cuts content off — and fired on `visible`, where
content merely paints outside its box and stays perfectly readable. It duly
reported the dashboard odometer, whose digit reel sits 6px proud of its
container by design.

Clipping needs `hidden` or `clip`. `auto`/`scroll` can be scrolled; `visible`
overflows harmlessly, and where that overflow reaches the viewport edge the
`past-right-edge` check already catches it — which is the case that hurts.

⚠ This is the **second** time the same mistake shipped: the text-scale check had
it too, and was fixed without checking whether the same reasoning error existed
elsewhere. **When you fix a rule, grep for the pattern it got wrong.** One
inverted overflow test is a bug; two is a habit.

### Sample widths AT the breakpoints, not at round numbers

Two bugs hid for the whole rehaul behind a sweep that used 320/360/390/430/768/
1024/1440 — sensible device widths that happen to step over the app's own
breakpoints.

**1. An unguarded 641–767 band.** The leaderboard's column-hiding rule lives in
`@media (max-width: 640px)` and the full table was only intended from 768. So
between those two widths **all eight columns showed and the panel scrolled
sideways**. The old sweep went 560 then 768 and stepped straight over it.

**2. Fractional viewport dead zones.** At `innerWidth: 767` on a 1.5 DPR display
— this machine, and most Android phones — the real viewport is ~767.33, so:

| query | matches |
|---|---|
| `max-width: 767px` | **false** |
| `min-width: 768px` | **false** |

Neither rule applies. The app had three such pairs, and one was the
mobile/desktop boundary itself (`max-width: 980` / `min-width: 981`) — the pair
that decides whether the tab bar or the desktop links render. In that gap
**neither navigation exists**.

All four max-widths that pair with a min-width now use `.98`, which closes the
gap without moving any breakpoint. Verified at 640/641/767/768/900/901/979/980/981:
navigation present at every one.

**Whenever you add `max-width: N` beside `min-width: N+1`, you have made a dead
zone.** Use `N.98`. And put the breakpoint values themselves into the sweep —
round numbers test the middle of ranges, which is where nothing ever breaks.

### The leaderboard hid the game on phones

Below 768 the board showed rank, name and points — one blunt cut. **STREAK and
HIT RATE were invisible to every phone user**, and those are the game's
signature mechanics: "how it works" leads on the ×3 streak multiplier, and hit
rate is the only measure of skill on the page. A leaderboard that hides them on
the device most people play on is hiding the reason to care about it.

Columns now return in order of value: streak at 420 (narrowest — a flame and a
digit), hit rate at 540, played at 660, the rest at 768. Wallet and tiebreak
error stay last: verification detail, and the two widest headers.

### A canvas says nothing unless you make it

`/dashboard-v2` renders three canvases. All three were unreachable to a screen
reader, and two were worse than unlabelled:

`react-chartjs-2` puts `role="img"` on its canvas and **no name**. That is worse
than leaving it alone — it inserts an element into the accessibility tree that
announces "image" and then says nothing at all. **Name it or hide it; never
`role="img"` with no label.**

- **The two charts are content**, so they are named. The summary carries what a
  sighted reader takes from the shape in one glance — the range, the direction,
  the start and end values, the series names. Not a reading of every point,
  which would be unusable.
- **The globe is decoration**, so it is `aria-hidden`. Every fact it draws is
  already text in the six `.globe-pin` tooltips beside it: name, country, power,
  status. Describing the drawing on top of that is noise. The pins are siblings,
  not children — a canvas cannot have DOM children — so hiding it does not hide
  them.

⚠ **Read the label you generated.** The first version emitted *"Total Value
Locked, ALL range, Jan to . rising from $0 to $2.38M."* — `labelsFor()` blanks
most entries on purpose so the x-axis shows about six ticks, so the *last* label
is almost always `""`. It renders fine and reads as a broken sentence. The
summary now takes the outermost **non-empty** labels.

Verified it also tracks a range switch live, since it is derived rather than
written once.

### The vault card was examined and is sound

Read the app's most-repeated object as a designed thing rather than measuring
it for defects. It holds up:

- Hierarchy exists through **colour**, not size — the yield is accent green on
  operational vaults and `--text-2` on pipeline ones, which honestly signals
  "this number is not live yet" without a second typographic level.
- The two card types carry **different metrics on purpose** (Gross yield /
  capacity / Annual revenue vs APY / capacity / TVL), which is right: a
  committed site and a funded one are not compared on the same terms.
- Status is a worded badge, never colour alone.

One observation deliberately **not** treated as a defect: at 390px the
"BESS Bucharest 01" card is 47px taller than its siblings, because it is the
longest name+location pair and both wrap to two lines. At that width the cards
are a single-column stack with gaps between them, so height differences are
invisible. **Raggedness only exists where cards sit side by side** — and at
768/1024/1440/1920 every row measured uniform.

`auditCardRows()` guards the case that would matter, per ROW rather than per
grid. Grid stretches its items by default so it passes today; it stops passing
the moment someone sets `align-items: start` on a card grid, which is an easy
and very visible mistake.

⚠ The first canary for it **did not fire** — removing `align-items: stretch`
changed nothing, because the cards happened to be equal height anyway. An
unfired canary validates nothing. It needed a forced 60px height difference
before it proved the check works.

### Full-bleed chrome, page-aligned contents

The sticky bars spanned the window and so did their *contents*. Measured at
2498px: the wordmark sat **655px** left of the content column and the wallet
pill **656px** right of it. On a large monitor the primary account control was
in the far corner while everything the user was reading sat centre-screen.

The background should still span the window — a sticky header that stops short
of the edges looks like a floating card. Only the contents move:

```css
padding: 0 max(26px, calc((100% - var(--shell-max)) / 2 + 28px));
```

Below ~1376px this resolves to the old 26px, so narrow and mid widths are
untouched. Above it, the brand lands exactly on the content's left edge and the
wallet pill on its right — verified at 1360/1440/1600/1920.

**`--shell-max` is 1320, the `.page` column — not Spreadcast's 1120.** That
section narrows its own reading width, and the chrome deliberately does not
follow: a nav that shifts position when you change section is more disorienting
than one that is 100px wide of one section's text. The section bar uses the same
inset as the nav directly above it, because two stacked bars disagreeing about
their left edge reads as a mistake far more loudly than either would alone.

⚠ More padding means less room for nav items. Checked 1024 → 1920 for overflow
in both bars before shipping; the nav had already been tightened once at
1024–1180 for exactly this reason.

### The audit never scrolled

Every check in the harness ran at `scrollY: 0`. That was harmless while
`overflow-x: hidden` silently broke `position: sticky` — nothing stayed put, so
scrolling changed nothing worth measuring. **Fixing sticky created a class of
bug the sweep could not see**, which is a good reminder that a fix can widen the
surface a suite needs to cover.

`auditScrolled()` now visits 25%, 50% and 90% of each page's scroll height.

It checks one thing on purpose: **two pieces of pinned chrome occupying the same
pixels.** Content scrolling *behind* a sticky header is correct, and flagging it
would bury the output in noise — but a sticky bar landing on another sticky bar,
or a docked CTA sitting on the tab bar, has no legitimate case. Canaried by
pinning `.sc-bar` to `top: 0`, which reproduces a 44px collision with the nav.

**Now observed:** `.sc-cta-dock` is the third sticky element, and its
`bottom: var(--nav-h-safe)` was written while sticky was broken app-wide, so
the fix went years unexercised. It has since been reached by overriding the
round state and audited across seven viewports — it never collides with the tab
bar, and its sticky rule is a no-op at most phone sizes because the panel is
shorter than the screen. Full write-up below under
"`.sc-cta-dock` — audited, correct, and mostly inert by design".

### `overflow-x: hidden` broke the sticky nav, and hid the bugs it looked like it solved

`html` and `body` both carried `overflow-x: hidden`. It computes to
`overflow: hidden auto`, which makes the element a **scroll container** — and
that breaks `position: sticky` for everything inside it.

Measured before removal: `.nav` is `position: sticky; top: 0`, and after
scrolling 58px its rect was `top: -58` — gone. The Spreadcast section bar,
`top: 58px`, pinned to `0` instead of below the nav. **The app's sticky
navigation had not been sticking**, probably for the whole rehaul, because
nobody scrolled and then measured.

It was also hiding the very bugs it appeared to solve. The comments on the
header, `.drow` and `.detail-layout` rules all record overflow that was
**clipped rather than scrollable** because of this line — the Marketplace Buy
button was not merely ugly, it was unreachable. Each of those is now fixed at
the element that caused it (`min-width: 0`, collapsible rows,
`minmax(0, 1fr)` tracks).

Removed both. The full sweep then reported **0 findings across 77 route × width
combinations**, which is the proof that the clip had nothing left to do.

**A blanket `overflow-x: hidden` is a way of not knowing.** It converts a
visible layout bug into an invisible one and takes sticky positioning with it.
Fix the element that overflows; let the audit tell you which one.

⚠ Removing it made a second bug real: `#main-content` is the skip-link target,
and jumping to it scrolls it to y=0 — **under** the now-genuinely-sticky chrome,
hiding 28px of the page heading. It has `scroll-margin-top` now, sized for the
tallest case (nav 58 + section bar 44). That bug existed the whole time and was
invisible because everything scrolled away.

### The page that convinces someone has to tell them what to do next

Counted the primary actions on every route. No screen has **competing** primary
CTAs, which is good hierarchy and worth keeping. But two had **none at all**,
and no internal links either:

| page | words | buttons | links |
|---|---|---|---|
| `/spreadcast/how` | 467 | 0 | 0 |
| `/spreadcast/log` | 114 | 0 | 0 |

`how` is the most persuasive content in the product. Someone who reads to the
end of it is the most convinced person in the app — and it handed them prize tax
handling, a GDPR notice, and no way forward but the section bar at the top.

Both now close with `.sc-next-step`. On `how` it sits **before** the fine print
on purpose: the fine print is the right thing to end on legally and the wrong
thing to end on persuasively, so the invitation goes where the conviction still
is. On `log` the framing is lighter — a reference page is not a pitch, and
someone checking the settlement record is asking "is this honest", so it answers
that first and invites second.

Accent **border**, not an accent fill: it has to read as the next step without
competing with the panels above, and the brand budget is ~2% green per surface.

**A page with zero actions is a design decision, so make it deliberately.** `/`
has none either and that is correct — the vault cards *are* the action, and a
CTA would compete with them. Zero is right when the content is the action and
wrong when the content is an argument.

### One label, one number, one format

`/` and `/dashboard-v2` both carry a tile labelled **TOTAL VALUE LOCKED** over
the same figure. They read `$2.44M` and `$2,440,000` — one nav click apart.

Nothing was *wrong*; both were accurate. But two presentations of one number
under one label make a reader ask which is right, and on a page about money that
is the worst available reaction. The `/dashboard-v2` tile was even inconsistent
with itself: `fmtMoney` in the headline, `fmtCompact` in its own sub-line for
the replacement fund.

Both use `fmtCompact` now. Compact is right for a glanceable metric beside a
sparkline; exact figures belong on the vault pages, where precision is the
point rather than decoration.

**Use the shared formatters.** `Total capacity` was already consistent across
both routes for exactly that reason — it goes through `fmtPower`/`fmtEnergy`,
so it cannot drift. Every number that appears in two places should.

⚠ Worth knowing: the two routes read from different sources — `dashboardMetrics()`
and `PROTOCOL`. They agree today. Nothing enforces that they keep agreeing.

### Two kinds of small text

The app uses 9px in three places, and only one of them was wrong.

`.sc-band-unit` ("€/MWh") and `.sc-table th` are **uppercase mono with
letter-spacing**. At that size those read as a typographic device — an eyebrow —
and nobody has to parse them to make a decision. They stay.

`.sc-band-hint` was **"38% of last 30d"**: lowercase, mixed, with a number in
it, on a card the user is choosing between. That is data informing a choice, and
it has to be comfortably readable rather than merely present. Now 11px, matching
`.sc-band-name` directly above it — the smallest size the app uses for anything
that is content rather than a label.

This was parked for months as "needs a real-device legibility check". It did
not. The question answered itself once the two kinds of small text were
separated. Verified it fits unclipped at 320/360/390.

### Naming a scale is not the same as imposing one

Spacing: **29 distinct pixel values across 808 declarations.** That reads like
sprawl and mostly is not — the top ten carry **69.6%** of usage, and the six
rarest (28, 34, 38, 44, 56, 80) are one-off layout dimensions, not stray nudges.

Compare the motion pass, which *was* worth consolidating: 0.15s was 22 of 26
transitions, so 0.12/0.2/0.25 were obviously nobody's decision. Here the most
common value is 14% of usage. There is no dominant rung and therefore no
outliers to fold into it.

So `--sp-1..7` name the seven rungs already doing the work, and **nothing was
migrated**. New work uses the tokens; existing values stay. Rewriting hundreds
of declarations onto a chosen scale would be a redesign with no defect to fix,
and the audit catches overflow but not "looks slightly off".

Measure before consolidating. A distribution with a dominant value has strays;
a flat one has a vocabulary.

### One motion character

`--ease` (`cubic-bezier(0.22, 1, 0.36, 1)`) was defined and then used **8
times**, while the browser default `ease` was used **39 times**. So the handful
of surfaces that used the token — sheets, onboarding, the battery fill — settled
differently from every button, card and row in the app. A product reads as
high-end partly because everything decelerates the same way.

Notably this was **not** a vaults↔Spreadcast seam. Both halves ignored the token
about equally (29 and 10). Four passes of the seam being the answer is not a
reason to stop measuring.

Two rules:

- **Transitions are interaction feedback and use the tokens**: `var(--t-ui)`
  (0.15s) and `var(--ease)`. 0.15s was already the de facto answer in 22 of 26
  declarations; 0.12s, 0.2s and 0.25s were near-duplicates nobody chose.
- **Animations paced to content keep their own duration.** A battery filling
  (1.1s), a progress bar advancing (0.6s) and a globe fading in (0.7s) are
  telling you about the thing, not acknowledging your tap. They take the shared
  curve but not the shared duration.

`--t-ui` is deliberately not named `--t-fast`: there is no scale, and implying
one invites guessing which rung to use.

⚠ `prefers-reduced-motion` still wins — the global block sets
`transition-duration` with `!important` on `*`, which beats a `var()` value.
Verified after the change, because a token indirection is exactly where that
could quietly stop applying.

**Known, deliberately not changed:** eight declarations use `transition: all`,
which animates every property including layout ones. Narrowing them needs
per-element judgement about what is actually meant to move.

### The share route, and why it waited

`/spreadcast/result/[day]` is the only route designed to be arrived at with no
context — a link pasted into a chat. It answers, in order: what happened, what
this game is, what you can do about it. It reads `archiveDay()` directly, the
same function the API route calls, rather than the server making an HTTP request
to itself.

It was deferred three times on the grounds that its value depends on people
actually sharing. What changed is `opengraph-image.tsx`: a share link with no
preview is a bare URL, but one carrying the day's own number and band is an
artifact someone pastes on purpose. The route became worth building the moment
the card could exist.

**Two affordances, not one.** A permalink *and* a share button. The link is the
honest primitive — middle-clickable, bookmarkable, readable before it is
followed. The button is the convenience. Offering only a button makes the URL
something the user must trust rather than see, which is the wrong default on a
page whose entire argument is that everything is checkable.

⚠ `params` is a **Promise** in `opengraph-image.tsx`, exactly as in `page.tsx`.
Destructuring it synchronously does not throw — it yields `undefined`, the
lookup finds nothing, and the card renders its generic fallback **with a 200**.
It looked like it worked. Only opening the PNG showed the number was missing.

⚠ Satori flattens fragments into the parent, so a `<>…</>` inside a conditional
put the band chip beside the figure instead of under it — legible by luck rather
than by layout. Wrap in an explicit `display: flex` element.

⚠ A share button must say something on every path. Dismissing the native sheet
throws `AbortError` and must stay silent — that is the user getting what they
asked for. Everything else needs a message, or a refused clipboard (insecure
origin, no permission, unfocused document) leaves a dead control.

### A page's title is part of its interface

Every route in the app shared one of **two** titles: "Megawatt — BESS Vaults"
for the whole vaults half *including each individual vault*, and "Spreadcast —
Megawatt" for all four game routes. Six vault pages open in six tabs were
indistinguishable, browser history was a wall of one string, and a bookmarked
vault said nothing about which vault. There were no `og:` tags at all, so a
link pasted anywhere rendered as a bare URL — the link doing no work for a
product whose vault URLs are meant to be shared.

The root layout defines `title.template`; pages set a short name and inherit
the suffix.

Two rules that are easy to get wrong:

⚠ **`title.template` applies to CHILD segments, not the segment that defines
it.** The root page rendered as a bare "Vaults", and `/spreadcast` — which sits
in the same segment as the layout carrying the Spreadcast template — read "Play
— Megawatt" while its three siblings correctly read "… · Spreadcast — Megawatt".
Both need their title spelled out.

⚠ **Put the distinct word first.** A tab truncates to roughly twenty characters,
so "Leaderboard · Spreadcast" survives and "Spreadcast · Leaderboard" does not.

**Metadata is user-facing copy and the no-fabrication rule applies to it.** The
first version of the vault description did its own arithmetic — `powerKw / 1000`
to one decimal — and described a 350 kW / 550 kWh site as "0.3 MW / 0.6 MWh",
understating one figure and overstating the other. Use `fmtPower`/`fmtEnergy`,
which keep sub-MW sites in kW and match what the page itself prints. A number in
a share preview is as public as a number on the page.

Still open: no `og:image`. That needs a real brand asset rather than one
invented here.

### The screens nobody designs

The 404 was the framework's default — a bare "This page could not be found."
inside our own nav, the one screen in the app that looked like it belonged to a
different product. And it is not rare: vault URLs get shared and bookmarked, and
a link to a vault that has been renamed or closed lands exactly there.

`app/not-found.tsx` treats it as an **empty state, not an error** — nothing went
wrong, the address just points at nothing — so it reuses the `.empty-state`
idiom and spends its space on exits rather than on apologising.

`app/error.tsx` is the root boundary. Spreadcast had one since it was built;
the vaults half had none, so any runtime error on `/`, `/portfolio`,
`/marketplace`, `/dashboard-v2` or a vault page fell through to the framework
screen — no nav, no way back, no indication which half broke.

**Be careful what an error boundary promises.** The first draft said "nothing
was submitted and nothing changed on-chain". A boundary catches a *render*
error and cannot know whether a transaction submitted a moment earlier went
through. It can only speak for what it knows: this page failed to draw. Saying
more is the same class of mistake as fabricating a number.

**Test the boundary by actually throwing.** An untested error screen is the
classic thing that turns out to be broken at the exact moment it is needed. Add
a temporary route that throws, look at it, delete it in the same pass.

⚠ Do not name that route `_something`. Folders prefixed with `_` are **private**
in the App Router and are never routed, so the test silently renders the 404
instead of the boundary and the check appears to fail for the wrong reason.

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
- [ ] If the surface is data-driven, checked the data isn't `[]` before believing a clean audit
- [ ] Every new form control has a `<label htmlFor>`, not a `div` that looks like one
- [ ] Every non-submit `<button>` inside a form has `type="button"`
- [ ] Any new overlay uses `Sheet` or `useDialog` — never a bare `.overlay` + `.modal`
- [ ] New type sizes are `rem`, never `px` — px ignores the user's font-size setting
- [ ] Responsive rules that hide a label clip it (`.sr-only`), never `display: none`
- [ ] A chart never draws a segment for a zero value
- [ ] A control identified by its border uses `--border-control`, not `--border-2`
- [ ] Any field rendering user-supplied text survives a 50-char unbroken token
- [ ] Selected state is exposed (`aria-pressed` / `aria-current`), not just coloured
- [ ] A temporary audit fixture never goes in a file that has uncommitted real work
- [ ] Nothing a wide layout shows is `display: none` on a narrow one without somewhere else to go
- [ ] Scope check (§1.2) empty
- [ ] No new raw hex or `rgba()` in components
- [ ] No fabricated data on any path
- [ ] `res.ok` checked on every new fetch
- [ ] Copy is specific and honest — no "Lorem", no invented statistics
- [ ] Secrets are in `web/.env` (gitignored), and `web/.env.example` lists any new key **by name only**

---

### A `display: none` in a responsive collapse is a content decision

When a wide table row stacks for a phone, the tempting move is to hide the
columns that no longer fit. Both data surfaces here did exactly that, and both
were wrong in the same way:

- `.mk-row` hid Premium, Est. APY **and the ask total** below 700px. The phone
  showed a vault name, a share count and a **Buy** button — and never the price
  that button charged.
- `.pf-row` hid APY, and stacked deposited and claimable as two unlabelled
  money figures, because the labels lived in a `.drow-head` that the same media
  query set to `display: none`.

Narrow does not mean *less informative*. It means *differently arranged*. The
rule: when a collapse removes a column, say where that content went. If the
answer is "nowhere", it is a bug, not a breakpoint.

The pattern that fixed both, and the one to reuse:

1. Wrap the middle metrics in one element (`.mk-meta`, `.pf-meta`).
2. `display: contents` on that wrapper at desktop widths — the children fall
   straight back into the original grid tracks, so the wide layout is unchanged
   and needs no re-verification.
3. In the stacked layout, that same wrapper becomes `grid-area: meta` with
   `display: flex; justify-content: space-between` — one labelled metric strip
   on the row's own line.
4. Labels ride in the row as `.row-lbl` spans, `display: none` above 700px
   where the column header already says it.

Two details that cost time:

- **Inline `style={{ textAlign: "right" }}` cannot be overridden by a media
  query.** If a value's alignment has to change when the row stacks, that
  alignment has to live in CSS. Moved to
  `.mk-meta > :first-child, .pf-meta > :first-child`.
- **`display: contents` is safe here only because the wrapper is a plain
  `div`** with no semantics to erase. Do not reach for it on anything that
  carries a role.

### Sweeping too early measures the skeleton, not the page

A document-structure sweep reported `/spreadcast` as having **zero headings and
no h1** — alarming for the game's main surface, and wrong. At 2.4s on a
degraded dev server the route was still showing its loading skeleton, which
correctly has no headings (it does carry `aria-busy`, `aria-live` and a
"Loading today's round" label). Waited to 6s and the real outline appeared: one
h1 and six h2s.

Routes that fetch before they render need a longer settle, or a wait on a
real signal, before any structural assertion. A finding of "this page has no
headings at all" is far more likely to be a timing bug in the audit than a
missing `<h1>` in a page that has shipped for months — check the cheap
explanation first.

### The audit tab is hidden, so animations never advance

`web/public/__responsive-audit.html` runs its sweeps in an iframe in a tab
nobody is looking at, so `document.visibilityState` is `"hidden"` — and Chrome
does not tick CSS animations in a hidden tab. They sit at `playState:
"running"`, `currentTime: 0`, permanently. Anything with an entry animation is
therefore measured **at its first keyframe**, not where it comes to rest.

This has now cost three separate false alarms. The most expensive read
"the onboarding sheet overflows the viewport on every phone size", 40 failing
measurements across nine viewports. The sheet was sitting at `transform:
translateY(100%)` — the `from` frame of `obSheetIn`, exactly its own height
below the fold. Nothing was wrong with it, and the giveaway was that the offset
equalled the element's own height to the pixel.

Waiting longer does not help; a hidden tab's animation clock does not run.
Call `settleAnimations()` before measuring — it jumps every animation in the
frame to its end. `waitForOverlay()` now calls it for you.

The general form of the mistake is worth naming, because it keeps recurring in
different costumes: **before believing a failure, check the measurement against
something you already know.** A sheet whose `top` equals the viewport height
exactly, on every size, is not nine independent layout bugs — it is one wrong
reading. Two minutes on "could my ruler be wrong?" has repeatedly been cheaper
than the fix it would have prompted.

### A document-level overflow sweep cannot see clipped user content

Every responsive sweep so far asked "does the document overflow?". The answer
was no, and it stayed no while the Spreadcast profile panel was **cutting the
user's own display name in half**.

With a 54-character unbroken name, the `<h2>` laid out to 433px inside 227px of
space; `.panel { overflow: hidden }` clipped the rest. No wrap, no ellipsis,
just a name truncated mid-word — at 320, 360 and 390px. The page never
overflowed because the panel absorbed it, which is exactly why a document-level
check could never find it.

**Two different questions:** "does the page scroll sideways" and "is anything
being cut off inside a box". The audit's `clipped-content` rule asks the second
one, but only for `overflow-x`; this was vertical-ish clipping of an
over-wide inline box inside `overflow: hidden`. The reliable per-element test
is `el.scrollWidth > el.clientWidth` on everything, not just the document.

Fixed with `overflow-wrap: anywhere` on `.sc-panel h2`, `.sc-notice` and
`.sc-table td` — the three places that render user-supplied strings (display
name, email, leaderboard names). `anywhere` rather than `break-word` because it
also feeds min-content sizing, so a flex or grid parent may shrink instead of
being held open by one long token. Verified: no clipping at 320/360/390, the
heading wraps to two lines, and the leaderboard is untouched for normal names.

That check is now `auditClipping()` in the harness, running inside
`runAudit()`. Two traps were hit while writing it, both worth knowing:

- **Comparing border boxes does not work.** A block element whose *inline*
  content overflows keeps its own width, so `getBoundingClientRect()` is blind
  to it. The content edge is `rect.left + el.scrollWidth`. The first version
  compared rects and would have missed the very bug it was written to catch.
- **It returned zero across 27 route/width pairs and looked like a pass.** It
  was measuring nothing. A silent check and a correct check are
  indistinguishable from the outside, so the canary has to be **three-state**:
  silent at baseline, fires when a long unbroken string is forced into a
  clipped box, silent again once the fix applies. One state proves nothing;
  two can be luck.

Run against the real app it found one defect in 27 pairs: on
`/spreadcast/log`, `"137 / 150 / 176 / 244"` ellipsised to `"…176 / 2"`
between 700 and 899px. The cell carried `.sc-mono`, whose truncation exists
for merkle roots and tx hashes — unbreakable 34-64 char tokens where an
ellipsis is right. Four short numbers joined by `" / "` are the opposite case.
**One class was doing two jobs**, the same shape as `--border-2` serving both
surface edges and control boundaries. When a rule is correct for one kind of
content and wrong for another, split the class rather than tune the rule.

`auditClippingVertical()` is the other half — text cut off at the *bottom* of
a fixed-height box. It found no real defects in 36 route/width pairs, but
auditing the one thing it did flag found a serious bug of a different kind.

**The odometer clipped by design, and that is exactly what broke it for screen
readers.** `.odo-reel` is a 1em window over a `0 1 2 3 4 5 6 7 8 9 0` strip
that slides on a transform — the clipping *is* the mechanism, so it reports
~300px of "cut" content forever. But the whole strip is real text in the DOM,
and the component had no aria at all, so a headline metric was announced as
eight repetitions of "zero one two three four five six seven eight nine zero".
Now `aria-hidden` on the machinery with the value stated once in an `.sr-only`
span: `"$328,793.42"`.

The accessible text is refreshed from the component's existing rAF loop, on the
same frame and from the same `value` as the digits. That invariant is what
makes it correct — it cannot drift from what is on screen, and if rAF is paused
neither advances. Which matters, because:

**A hidden tab freezes `requestAnimationFrame` completely, not just CSS
animations.** Measured: 0 rAF ticks in 3 seconds, reel transform frozen at
`translateY(-3em)`. `settleAnimations()` does not help — it finishes CSS/WAAPI
animations, not rAF loops. Anything rAF-driven simply cannot be observed in the
audit harness; verify it by reasoning about the invariant instead, and say so.

**Suppressions need their own canary.** `.odo-*` is excluded from the vertical
check, with the reason stated in the code — a check that cries wolf every run
gets ignored, which costs more than the false negative. But a suppression that
is too broad silently mutes real findings, so it is canaried the same way: the
odometer must be silent *while* a clip forced onto a neighbouring element is
still caught.

**Generated code needs reading back.** That suppression did nothing for its
first two runs. Written through a heredoc, the `\b` word boundary in
`/\bodo-/` became a literal backspace character — the file contained
`/\bodo-/`, which matches nothing. `cat -A` showed it as `/^Hodo-/`. It now
uses `String.includes`, which has no escapes to mangle, and the whole file was
scanned for stray control characters.

### The primary navigation never said which page you were on

Chasing the previous entry's "where does this lead" question in the direction
automation *can* answer: every internal link was collected from eleven routes
and fetched. **14 unique links, all resolving with correct per-route titles.**
The control also showed a nonexistent route returns a genuine **HTTP 404**, not
a soft 200 — worth knowing, and not previously verified.

Two instrument notes from that, both the same shape as before:

- The first detector matched `"Page not found"` anywhere in the HTML and
  flagged **all 14**. Next embeds the not-found boundary in the RSC flight
  payload of *every* page, so the string is always present. The titles were
  visibly correct, which is the only reason it was caught rather than reported.
- Once corrected, the status code alone would have sufficed. The elaborate
  check was answering a question the protocol already answers.

What the pass actually found came from asking the same question of the nav.
`aria-current` was added to the **Spreadcast section bar** several passes ago;
the **main nav and the phone tab bar** never got it. Which page you are on was
drawn and nothing more, on the two navigations present on every single page —
and the tab bar duplicates the main nav, so a screen-reader user met each
destination twice with neither copy saying which was current.

Both now carry `aria-current="page"` ("page", not "true": these are location
links, not toggles). Verified across six routes, and the useful assertion is
not "the attribute exists" but **`aria-current` count === `.active` count** on
every route — so the ARIA and the styling cannot drift apart.

### Every CTA invited an action the app cannot perform

Tracing what happens when a new user does the thing the app asks: **nothing in
this app takes a deposit today.** Both operational sites are showcases marked
"not investable", and all four onchain vaults are `status: "coming_soon"`, which
sets `disabled={isComing}` on both deposit triggers.

Three empty states did not know that:

- **Portfolio** — *"Deposit into a vault to start earning…"* with a **Browse
  vaults** button. Follow it, look at six vaults, find no way in, conclude you
  have missed something.
- **Marketplace** — *"list one from your portfolio"*, and a **Go to your
  portfolio** button, which lands on the empty state above. One empty state
  routing to another is a loop, not a route.
- **The sell dialog** — *"deposit into a vault first"*, written by me two passes
  ago while fixing a different dead end in the same dialog.

All three now state the real position and offer something that works: deposits
open when the pipeline sites start fundraising **next quarter** — the app's own
wording from the pipeline cards, not a date invented here — with routes to the
pipeline and to Spreadcast, which is genuinely playable today.

**Two things worth carrying:**

A dead end is easy to spot; a **loop** is not. Each of these CTAs looked
reasonable in isolation and only failed when followed. Walking the journey is
the only way that surfaces — no automated check models "did this button lead
anywhere useful".

And **I wrote one of them.** The sell-dialog copy was added while fixing that
dialog's own dead end, and repeated the error one level out. Fixing a dead end
is not the same as checking where the replacement points.

### Icons are all decorative — which is exactly why nothing must be icon-only

Following the flag finding to the rest of the graphics: `Icons.tsx` sets
`aria-hidden` inside its `svg()` factory, so **all 24 icons are decorative by
construction**. That is correct, and it means the flag was the outlier rather
than the first of many.

It also creates the complementary risk. If every icon is hidden, an **icon-only
button has nothing left to name it** — and the failure is silent: the control
renders perfectly and simply announces as "button".

Nothing was checking for that. `auditLabelInName()` is the complement and only
examines controls that *have* visible text; it cannot see a control with nothing
to compare. So `auditControlNames()` now covers the other half, and it resolves
names the way assistive tech does — walking the subtree while **skipping
aria-hidden branches**, rather than using `textContent`, which would count the
icon and report a name that is never announced.

**It ran clean:** zero nameless controls across eight routes plus the onboarding
overlay, which earlier structure sweeps had skipped entirely — and overlays are
precisely where icon-only close buttons live. Validated with the usual
three-state canary: silent at baseline, catches a button whose only child is an
`aria-hidden` svg, quiet again once given an `aria-label`.

So this check exists to keep a clean state clean rather than because it found
something. That is worth doing when the failure mode is invisible in the
rendered page and the guard against it — `aria-hidden` on every icon — is
exactly what makes it invisible.

### A decorative flag that announced itself before every location

With the automated sweep clean, what is left is what automation cannot judge —
content and redundancy. `Flag` renders `role="img"` with **both** an
`aria-label` and a `<title>`, and with no `title` prop the label falls back to
the bare ISO code.

All six call sites place a flag immediately before text that already names the
place. Measured, that produced:

```
"SI Ljubljana, Slovenia"        "SI BESS Ljubljana 01"
```

— a cryptic two-letter code in front of every location, **18 times on
`/dashboard-v2` alone**. Not information; a stutter before the real label.

The component's own header already said what it is: *"the flag is a location
cue, not a rendition."* It is now decorative by default — `aria-hidden`, no
role, no `<title>` — with an explicit `title` prop as the opt-in for a flag that
ever has to stand alone. `NetworkPanel` was passing `title={s.location}` beside a
row that spells the location out, so it announced the location **twice**; that
prop is gone.

Verified across 24 flags on two routes: all decorative, none named, none
carrying a `<title>`, all still rendering, and the row announcement reduced to
"BESS Ljubljana 01 Ljubljana, Slovenia Operational 12.2% Gross yield".

**Untested in situ, and worth saying:** no caller now passes `title`, so the
named branch is type-checked but not exercised on any page. It is three lines
and exists for a future standalone use.

**Checked at the same time and correct:** all six flag codes match their
locations — 🇸🇮 Slovenia ×2, 🇷🇸 Serbia, 🇩🇪 Germany, 🇱🇹 Lithuania, 🇷🇴 Romania.
A wrong flag is exactly the class of error no automated check would catch, so it
was worth confirming rather than assuming.

### Full regression sweep — 88 combinations, clean

After roughly twenty-five passes of point fixes it was worth asking whether the
app still holds together, rather than hunting for a twenty-sixth. Eleven routes
(including the 404 and a settled result page) × eight widths from 320 to 1440,
run against a **fresh production build** rather than the dev server, which
degrades badly under sustained sweeps.

`doc-overflow`, `clip-h`, `clip-v`, `label-in-name` and `ragged-row`: **zero
findings across all 88.**

**That number means nothing without a canary, and the first canary lied.** It
targeted `d.querySelector('p, .card, div')`, which returned a **0×0 empty div** —
Next's root marker. Both clipping checks correctly skip elements with no text
or under 2px, so it could never have fired, and the run reported
`CHECKS INERT — result meaningless`. Retargeted at a real text-bearing element
the horizontal check fired at 828px and the vertical at 173px, and both went
silent once the element was restored.

So the clean result stands — but only because the first canary was disbelieved
rather than the sweep. **A canary needs to be checked as carefully as the thing
it validates**, and "it didn't fire" has two explanations, exactly as "it found
nothing" does.

A smaller version of the same mistake in the restore step: `Object.assign(style,
{h, ov, ws, w})` sets four meaningless properties, because those are not CSS
property names. The third state only completed after restoring with
`style.removeProperty('white-space')` and friends.

### "Updated per block", on a page that never reads a block

Seeing `/dashboard-v2` whole — a page modified repeatedly this session but never
viewed end to end — turned up one more provenance claim of the kind already
corrected there for "value locked" and "depositor yield".

Section 01 was headed `meta="Updated per block"`. `lib/protocol.ts` is titled
*"protocol-level overview mock data"*; every figure in that section is a static
constant derived from `VAULTS`, and the only thing that moves is the yield
odometer accruing client-side at a **modelled** rate (`tvl × apy ÷
seconds-per-year`). Nothing reads a block. Next to a "XRPL — Mainnet" ribbon
that reads as a statement about where the numbers come from.

It was also the odd one out: the sibling metas describe *content* ("TVL &
depositor APY — historical", "Deployed & pipeline capital"), not update
frequency. Now "Across the operating sites".

**Flagged, not changed — for the founders.** The ribbon above it renders a
pulsing green dot and **"All systems operational"** from a hardcoded string with
`className="ribbon-live"`. Nothing checks anything: if the app or the ledger
connection were down, it would still say this. A status indicator that cannot
report bad news is worse than no indicator, because it is read as evidence. But
whether to wire it to a real health check or remove it is a product decision,
and the same restraint applies as with the "Total Value Locked" label — the
sub-line was corrected, the headline left to whoever owns the positioning.

### The entry about mangled escapes was itself mangled

Worth recording because it is the same bug twice, the second time inside its own
write-up.

An earlier pass shipped a suppression whose `` had become a literal backspace
(0x08) on the way through a generator. The entry documenting that was written
the same way — and `` in *that* string became a backspace too, so the
paragraph explaining the corruption contained three invisible control characters
where it meant to show ``.

Found by running the same control-character scan on the doc that the original
fix ran on the harness. Two attempts to repair it as text reported success and
changed nothing; replacing at the **byte level** (`b""` → `0x5C 0x62`) worked
first time and could be verified by counting bytes before and after.

**The rule:** when the thing you are writing *is* an escape sequence, write it as
bytes or verify it as bytes. Text-level tooling is exactly what corrupted it, so
text-level tooling is not what proves it fixed.

### The earlier sweep missed two groups because it searched for vocabulary

The "selected state carried by colour alone" pass fixed five groups. The
leaderboard's two filters — period and player — were not among them, and had
the same defect: state in a CSS class, no `aria-pressed`, no group name, four
identical-sounding buttons.

**They were missed because the sweep searched for the wrong thing.** It looked
for `.seg-btn` and the marker words `"active"` and `"selected"`. These use
`.sc-seg` and `"on"`. The defect is the *state-driven className*, not the
vocabulary someone happened to pick for it — so the search that finds all of
them is for the shape:

```
className={[^}]*\?\s*"[a-z-]*"\s*:\s*""
```

Run that way it returns every candidate in one go. It also confirmed the rest
are already handled: `NetworkPanel`'s site rows carry `aria-pressed`, and the
two charts and `VaultsOverview` were fixed earlier.

**One candidate it surfaced that correctly needs nothing:** `BessGlobe`'s pins
are `<span onPointerDown>` — pointer-only, unfocusable. But `NetworkPanel`
renders *the same selection* as a real `.site-row` button list with
`aria-pressed` directly beside the globe, so the accessible route exists and
the pins are a duplicate. Same judgement as the bar strips: when the action is
available elsewhere, rebuilding the decorative copy is not the proportionate
fix.

Also audited this pass and clean, so it need not be redone: `/spreadcast/board`
at seven widths — the ten prize chips wrap 4→3→2→1 rows with no overlap, each
63×24, and the table's column ladder runs 3 → 5 → 8 with no clipping or
overflow anywhere.

### reduced-motion was honoured everywhere except where things actually move

`globals.css` has a thorough `prefers-reduced-motion: reduce` block — every
animation and transition clamped to 0.01ms, the four looping ones killed
outright. **No component checked the setting in JavaScript**, and CSS cannot
reach a `requestAnimationFrame` loop.

The app has exactly two continuous JS animations, and they are its two most
kinetic elements:

- **`Odometer`** — rolls its digits forever, by design.
- **`BessGlobe`** — `phiRef.current += AUTO_SPEED` on every frame whenever it is
  not being dragged or hovered.

So someone who has asked their OS to stop motion got a page where everything
obeyed except the spinning globe and the endlessly rolling counter.

`usePrefersReducedMotion()` now gates both. The odometer skips its loop
entirely — the reels keep the transform computed during render, which is already
correct for `startValue`, and the `.sr-only` text already states it, so the
number is right and simply does not spin. The globe stops only the **idle spin**;
the rest of that loop is easing toward a user-requested target or drawing, so it
stays usable. It reads through a ref rather than a dependency, because that
effect also creates and destroys the globe instance and re-running it on a media
query change would rebuild the canvas.

**Deliberately not gated:** the countdowns (`RoundContext`, `DailySpread`) and
the telemetry simulation (`SiteMonitor`, `VaultDetail`). Those are values
changing once a second or every 2.2s — data, not animation. A clock that stops
is a broken clock, and reduced motion is about movement, not about freezing
information.

**What could not be verified here, and why.** The harness cannot observe motion
stopping: a hidden tab freezes rAF outright, so the odometer measured
`translateY(-3em)` unchanged over 2.5s *with motion enabled too*. That is the
limitation recorded earlier under the rAF entry, and it bites any reduced-motion
work. What was verified is that nothing regressed — both components render,
the reel sits at its correct position, the accessible value reads
`$328,793.42`, the reels stay `aria-hidden`, the globe canvas sizes and all
seven pins mount, at 390 and 1280 with no clipping or overflow.

### An instruction addressed to half the audience

`/spreadcast/log` tells you, in its own subtitle: *"Click a day for the full
price curve and everyone's revealed predictions."* The day rows were
`<tr onClick={onToggle}>` — no `tabIndex`, no `role`, no button. A `<tr>` is not
focusable, so the `▸` marker advertised a disclosure that **only a pointer could
open**, and that sentence was addressed to half the people reading it.

This is a step up in severity from the bar strips in the previous entry. There,
naming the picture was enough because the data existed elsewhere — the stats row,
the results log. Here the thing behind the disclosure (hourly curve, revealed
predictions, permalink, share) has no other route on the page, so it needed a
**real control**, not a label.

The button sits **inside the cell**, not on the row:

- the table keeps its semantics — a row is not a button;
- `aria-expanded` and `aria-controls` make the state announced rather than only
  drawn as a triangle;
- the row keeps its own `onClick`, because a large pointer target is the nicer
  interaction and costs nothing — with `stopPropagation` on the button, or the
  row handler fires second and toggles it straight back. **That is worth
  testing explicitly**: a double-toggle looks exactly like a control that does
  nothing, and only shows up if you check that one activation produces one
  state change.

Sized to the 24px floor while there. The text alone measured 94×**21**; the row
is clickable too so the real pointer target is far bigger, but the control is
what takes focus and draws the ring, and it should not be the one thing on the
page under the minimum.

### Two bar strips that were pictures to some people and nothing to others

Spreadcast draws its data twice as bars: 30 daily swings on Play, and 24 hourly
prices inside an expanded archive day. Both were invisible to anyone not using a
pointer.

- **`.sc-hist`** — 30 `<span>`s with no text, no label, no role and **no
  `tabindex`**. Which also made `.sc-hist span:focus-visible` in `globals.css` a
  rule that could never match: nothing in there can take focus.
- **`.sc-hourly-grid`** — 24 `<div>`s described only by `title`, already
  established in this file as the weakest channel there is.

Both now carry `role="img"` and a label built from the real numbers — *"Daily
price swings, last 30 days: 89 to 292 euro per megawatt hour, average 163"*, and
*"Hourly prices, 00:00 to 23:00: 20 to 204"* — which also makes their children
presentational, so 30 empty spans stop being 30 anonymous nodes.

**The per-day detail stays pointer-only, and that is a deliberate limit rather
than an oversight.** Making 30 bars focusable would add 30 tab stops to reach
data that is not exclusive to them: the band distribution sits in the stats row
directly beneath, and every single day is a row in the results log. Naming the
picture is the proportionate fix; rebuilding the strip as a keyboard-navigable
widget is not.

The dead `:focus-visible` half of that CSS rule was removed. It was harmless
while it merely did nothing, but under `role="img"` a focusable descendant would
be invalid — so leaving it would read as evidence of keyboard support that
cannot exist there.

### Reading the warnings, and a hypothesis that was already solved

Acting on the previous entry's "read the warnings": the production build is now
genuinely clean — no `metadataBase` warning, nothing else — and the browser
console across every route carries nothing from the app (only a browser
extension's own logging). That is a result worth recording so the next pass does
not repeat it.

With that clear, the remaining unexamined surface was **toasts** — the app's
feedback channel for every money action. Two findings, and the more useful one
is the negative:

**The collision I predicted did not exist.** `.toasts { bottom: 22px }` with
`z-index: 2000` over a ~75px tab bar looks certain to overlap on a phone — the
exact failure `.sc-cta-dock` was given `--nav-h-safe` to avoid. Measured, the
toast clears the bar by 11px at both 390×844 and 360×640, because
`globals.css` already carries
`.toasts { bottom: calc(var(--nav-h-safe) + 12px) }` below the nav breakpoint.
Reading one declaration and reasoning from it would have produced a confident
"fix" for a solved problem.

**The toast viewport announces nothing.** `role` and `aria-live` are both absent
at every width, so "Deposited $10,000.00 RLUSD", "Claimed €1,284.40", "Bought N
shares" and "Address copied" reach nobody using a screen reader. It lives at
`wallet.tsx:366` and is out of scope by standing instruction, so the work done
here was to make the handoff *decisive* rather than to leave it as an assertion:
measured evidence at three widths, plus the confirmation that the container is
permanently mounted and reused (present with zero children, same DOM node when a
toast appears) — which is what makes it an attribute-only change under the
mounted-region rule this session established.

### The share cards pointed at localhost

Directly downstream of the previous entry, and the reason it matters: fixing
`twitter:card` to `summary_large_image` is worthless if the image URL is not
reachable. It was not. The build says so, and had been saying so:

```
⚠ metadataBase property in metadata export is not set for resolving social
  open graph or twitter images, using "http://localhost:3000"
```

`og:image` and `twitter:image` are emitted as **absolute** URLs resolved
against `metadataBase`. Unset, every card in the app — root, each vault, each
settled Spreadcast result — pointed at a host only this machine can reach, and
would render with **no image at all** for everyone else.

Now `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")`.
The production origin is **not invented here** — it comes from the environment,
with the dev origin as the fallback so local builds behave exactly as before.
`NEXT_PUBLIC_SITE_URL` is documented in `.env.example` by name, per §6.

Verified end to end rather than by reading the diff: built and served with
`NEXT_PUBLIC_SITE_URL=https://megawatt.example`, then fetched three routes and
confirmed every `og:image` resolved to that origin with `summary_large_image`
alongside. Then the server was stopped and the app rebuilt without the variable,
so the working state is unchanged.

**Two build warnings had been printing this whole time.** Neither was a test
failure, so neither stopped anything, and the definition of done in §6 only asks
for a *clean build* — which this was, warnings and all. Read the warnings.

**Still missing, and deliberately not added:** `robots.txt` and `sitemap.xml`.
Both are absent, and for a product whose vault and result links are meant to be
found that is a real gap — but it is SEO infrastructure rather than UI, and
inventing a canonical domain to populate a sitemap is exactly the guess this
entry avoided making for `metadataBase`. Flagged for whoever owns the domain.

### A setting that was right when written, and wrong once the image landed

The Spreadcast result page exists to be pasted into a chat, so its share tags
matter more than its layout. Reading the *rendered* tags rather than the
metadata source found `twitter:card` = **`summary`** on every route.

`summary` renders a small square thumbnail. Every card this app ships — the
root, each vault, and each settled result — is **1200×630 landscape**, so X was
cropping all of them to a postage stamp.

The interesting part is *why*, and it is not carelessness. The comment directly
above it read: *"No og:image yet: that needs a real brand asset, not one
invented here."* `summary` was **correct when written** — there was no image, so
a small card was all there was to show. `opengraph-image.tsx` landed later in
the same body of work and the card type was never revisited. The comment stayed
behind asserting a state that had stopped being true.

Now `summary_large_image`, verified on five routes by reading the served HTML.

**The generalisable bit:** a setting justified by an absence needs revisiting
when the absence is filled. Grepping for `twitter:card` in the source would have
shown a value that looked deliberate and had a comment defending it. Only
fetching the page and reading what a share crawler actually receives exposed the
mismatch between the card type and the image beside it.

Also checked on the same page and found correct, so nobody re-does it: the
result OG image renders this day's real numbers (184.70, Swingy · 176–244, the
right band colour) — the `params`-not-awaited bug recorded earlier is not
present here; `generateMetadata` awaits `params` and supplies a per-result
title and description; and `.sc-result`'s 720px centred measure is a deliberate
choice for a context-free landing page, not a misalignment to fix.

### A header row over nothing, again — and a fixture in the wrong file

`/spreadcast/log` rendered its **Weekly blockchain anchors** table as four
column headers — WEEK / MERKLE ROOT / LEAVES / TX — over an empty body. On a
section about tamper-proof records that reads as a broken feature rather than
an early one.

The marketplace had already fixed exactly this, and says so in place: *"was a
header row over nothing… an empty marketplace is the normal early state, not an
error."* Same idiom applied here — what is missing, why, and where the record
does live meanwhile ("every prediction is still committed and revealed daily —
open any day in the table above").

**Two process notes, both about the fixture rather than the fix.**

`anchors` is fetched, not static, so seeding `useState` was not enough: the
effect's `setAnchors(d.anchors)` overwrote the seed on the next tick and the
populated branch still never rendered. **A `useState` fixture is useless against
anything that fetches** — the setter has to be suppressed too.

More importantly: that fixture lived in **the same file as the real change**, so
`git checkout --` would have destroyed both. This file already records losing
work that way once. The revert was done surgically instead — two targeted
replacements — and checked with `git diff --stat`, which showed **22 insertions
and 0 deletions**. Zero deletions is the useful signal: it proves the original
lines are byte-identical again, which "it looks right" never does.

### A timeline that read as though it ran backwards

`/spreadcast/how` is the page whose entire job is explaining the rules, and its
clock listed:

```
15:00   Predictions open for the day after tomorrow.
11:45   Predictions close — before the daily European auction runs…
~13:00  Auction results publish.
15:00   Results are scored…
```

Read as a column of times that is 15:00 → 11:45 → ~13:00 → 15:00, which looks
like predictions close six hours *before* they open. They do not: a round for
delivery day X opens at 15:00 on X−2 and closes at 11:45 on X−1. The only jump
is a day boundary the list never mentioned — on the one row that decides
whether a player gets their pick in at all.

Fixed with four words: *"Predictions close **the following day** — before the
daily European auction runs…"*. Rows three and four then read naturally as
continuing on that same day.

**The day model was verified, not assumed.** These are the rules of a game with
a real prize pool, so guessing at timing would be worse than leaving it
ambiguous. `X−2 → X−1` was checked against the app's own behaviour: PlayView
showed round `2026-08-02` as the open round on `2026-08-01`, which is only
consistent with a round opening two days before its delivery day.

Only the description span changed, not the time cell — `HowView` carries a
comment about `"11:45 Ljubljana time"` once wrapping to three lines in a 92px
column, and the time cells measured a stable 62px with no wrapping at 320
through 1280 afterwards.

### Spreadcast's core action announced nothing at all

Applying the previous entry's rule — mount the region, toggle its contents —
across the app found three conditionally-rendered status paragraphs in
`PlayView`, and they were worse than the deposit case: **none of them had a
role or `aria-live` at all.**

That one paragraph carries the entire result of the game's core action:

- "Prediction locked in — you can change it until close."
- "Locked — your prediction is now on XRPL mainnet."
- "Sign request declined in Xaman." / "Sign request expired — try again."
- every API error from `/predict`

A screen-reader user pressed **Lock in prediction** and heard nothing. The same
was true of the join and wallet-link results (`acctMsg`, rendered in two
mutually-exclusive branches). All three are now mounted `role="status"
aria-live="polite"` regions that collapse to zero height when empty, so the fix
costs no layout.

**The populated path is reasoned, not clicked** — and the reason is worth
recording. Triggering a real message means submitting a prediction to the live
account, which is not something an audit should do. The one message that
*doesn't* touch the network, `"Pick a band first."`, turns out to be
unreachable: `submit` has a single call site and that button is
`disabled={busy || sel == null}`, exactly when the guard would fire. So the
canary could not be made to fire safely. Verified structurally instead —
mounted, empty, `polite`, same DOM node across a click, zero height — and the
in-place text update follows from React reconciling the same element.

That dead guard surfaced one more thing. The CTA is disabled with no stated
reason, which is the pattern `VaultDetail` already names as a dead end. Sighted
users have five large band cards immediately above and the reason is obvious; a
screen-reader user meets a dimmed button and is told only that it is
unavailable. It now carries an `aria-describedby` hint **only while disabled**,
removed the moment a band is chosen.

### The same shape on the money path — and a live region that was late

Taking the previous entry's rule to the other dialog that changes size: the
deposit modal renders its validation message conditionally, so typing an amount
grew the dialog 460→486px on desktop and 582→626px at 390px. Being centred, it
pushed itself up by half and the confirm button **down** by 13px (desktop) or
22px (mobile) — while the user was mid-keystroke on an amount of money.

The fix is to keep the message element mounted and empty rather than to render
it conditionally, and there is a **second and better reason** to do that than
layout: a `role="alert"` inserted into the DOM *with its text already in place*
is announced unreliably — several screen readers only pick up a change to a
region that was already present. Conditional rendering was costing both
stability and the announcement.

`.field-error:empty` reserves one line and drops the `::before` "!" badge, so
there is never an error marker without an error.

Result: **0px** movement on desktop, 9px at 390 and 320. The residual is the
message wrapping to a second line on narrow screens. Reserving two lines would
remove it and cost a permanent 19px gap under every amount field — a worse
trade, so it stays and is recorded rather than quietly "fixed".

**Worth generalising:** conditionally-rendered validation text is the default in
React and it is wrong twice over. Mount the region, toggle its contents.

### A centred dialog that changes height moves its own button onto the scrim

The onboarding had been audited repeatedly — focus trap, state machine, layout
at nine viewports — and passed every time. Actually *looking* at it, one step at
a time, found something none of those checks asked about: **does the primary
button stay in one place?**

It does not, on desktop. Measured at 1280×800, the CTA sat at y=588 for three
steps and jumped to **y=525** on the fourth. The steps genuinely differ — bodies
of 305/302/307/**122** and footers of 101/101/101/**159**, because the wallet
step trades bullet points for an extra button — and a *centred* dialog
re-centres when its height changes.

The severity is not "jarring". Step 4's sheet ends at y=569, so the spot the CTA
had occupied for three consecutive clicks is now **outside the sheet, over
`.ob-scrim`** — verified with `elementFromPoint`. A press there dismisses the
flow. **Click "next" three times in the same place and the fourth click closes
the onboarding you were half-way through.**

Fixed with `min-height: min(470px, calc(100vh - 48px))` on the desktop dialog.
`.ob-body` is `flex: 1 1 auto`, so it absorbs the slack and the footer stops
moving; the `min()` keeps a short window obeying the existing max-height instead
of overflowing it. Verified 0px movement at 1280×800, 1024×768, 981×700,
1440×900 and 1280×520.

**The phone layout never had this bug**, and the reason is worth keeping: a
bottom sheet is anchored to the viewport bottom, so its footer is fixed *by
construction* — measured at y=803 on all four steps, before and after. Its sheet
heights still vary (514/557/540/365) and that is correct; it grows upward from a
fixed edge. Centring is what converts a height change into a moving target.

**Generalises to any multi-step centred dialog.** If the content differs between
steps and the container is vertically centred, every control moves. Either pin
the height or anchor the dialog to an edge.

### The failure pages were missed by the title work

`layout.tsx` explains why per-route titles were added: *"browser history was a
wall of the same string."* Both failure surfaces were missed by that effort.

- **404** had no `metadata` export, so it inherited the layout `default`. A dead
  vault link opened a tab labelled **"Megawatt — BESS Vaults"** — history,
  bookmarks and the tab strip all recording a page that does not exist as the
  vaults page. It is a server component, so a `metadata` export fixes it
  properly.
- **error.tsx is a client component**, and client components *cannot* export
  `metadata` in the App Router. Without a different mechanism the tab keeps
  whatever title the route that just failed had set. Set imperatively via
  `document.title` in an effect — the one case where that is the correct tool
  rather than a workaround.

Both pages are otherwise good and were verified at 320/390/768/1280: correct
headings, every recovery action fitting a 320px row with no sub-24px target, no
clipping, nav preserved so the user is never stranded.

**Reaching the error boundary needs a route that throws** — and *not* one
prefixed with `_`, since `_`-folders are private in the App Router and silently
render the 404 instead (that mistake is recorded earlier in this file).

**A temporary route leaves residue outside the source tree.** Deleting
`src/app/throw-probe/` was not enough: Next had generated
`.next/dev/types/app/throw-probe/page.ts`, which then failed `tsc` with
*"Cannot find module …/page.js"* — a broken typecheck in a working tree that
`git status` reported as clean. Build artefacts under `.next/dev/{types,server,
static}` have to be cleared too. **`git status` is not a sufficient check that a
fixture is gone.**

### A percentage decided a question only pixels can answer

`auditClippingVertical()` — added two passes ago and quiet ever since — earned
itself on the vault detail page: the yield-breakdown `.segbar` was clipping its
own content by 9px at 320 and 360, and nowhere else.

The cause is a units mismatch worth recognising. Both `.segbar` call sites
decide whether to print a label from the segment's **share of the total**
(`bps / total > 0.12`). Whether a label *fits* depends on **absolute pixels**.
At 320px the bar is ~270px wide, so a 12%-of-total segment is ~32px — too
narrow for "1.6%", which wrapped to two lines totalling 34px inside a
`height: 30px; overflow: hidden` bar, and lost 9px off the bottom.

Two fixes, deliberately at different levels:

- **Structural:** `white-space: nowrap; overflow: hidden` on the segment, so a
  label can never change the bar's height again regardless of what any call
  site decides. Verified by `scrollHeight === height` at every width.
- **Editorial:** below 480px the labels are dropped entirely. The widest
  non-dominant segment cannot hold four characters at any sensible size, and
  both call sites render a legend directly beneath listing every label *and*
  value — so the bar becomes what it still honestly is, a proportion.

Worth noting what *didn't* get changed this pass. The vault grid was measured
across eight widths on suspicion of an orphan-card problem: it goes 1→2 columns
at ~900px and 2→3 at ~1180px, so at desktop the Active section leaves an empty
track and Pipeline runs 3+1. That is real, and it is also **fine** — the cards
keep one consistent width down the whole page, and forcing 2×2 would make
pipeline cards visibly wider than the active cards above them. A measurement
that says "this is acceptable" is a result; changing it would have been
manufacturing work.

### The headline numbers did not mean what their labels said

Following the previous entry's rule — *ask which other surfaces make the same
claim* — to the largest numbers in the product.

`lib/protocol.ts` is explicit about what "TVL" is:

```ts
/** Value of the two real operational systems (Ljubljana + Metlika capex). */
export const OPERATIONAL_VALUE = VAULTS.filter((v) => v.kind === "showcase")…
// TVL = the operational systems (not tied to any chain).
tvl: OPERATIONAL_VALUE,
```

So **$2.44M "Total Value Locked" is company-owned capex, not user deposits** —
of which there are none. In this sector TVL is read as depositor money. The
landing tile's sub-line read `"2 active · 0 fundraising"`, which reinforces
exactly the wrong reading: *two vaults you can be in*. It now reads
`"2 operational sites · none open for deposit yet"`.

Likewise `cumulativeYield` — described in the source as "Ljubljana ~2 yrs +
Metlika ~11 months of revenue" — was subtitled **"Depositor yield and protocol
fees, realtime"**. Depositor yield, with no depositors. Now "Revenue earned by
the operating sites to date", which is both true and still a strong claim.

Fixing those two made dashboard-v2 contradict *itself*: its page subtitle
enumerated "value locked, depositor yield" 60px above tiles that now said
something else. Corrected to match.

Two judgement calls worth being explicit about:

- **The headline labels were left alone.** Renaming "Total Value Locked" is a
  positioning decision that belongs to the founders, not to a design pass. The
  sub-lines carry the correction instead — the number is no longer misreadable,
  and the naming question is raised rather than silently answered.
- **"Depositor yield 74%" in Yield Composition was left alone and is correct.**
  It names how revenue is *split*, which is a statement about the model, not a
  claim that anyone has been paid. Same words, different claim — checked by
  switching to that tab rather than assuming, since a blanket find-and-replace
  would have broken it.

### A qualifier fixed on the detail page never reached the card

`VaultDetail` carries a long comment explaining why "Showcase site · not
investable" was moved up beside the yield:

> *A financial page must not put its most important qualifier last.*

That fix was made on the detail page and stopped there. The **overview** — the
page where someone actually decides what to click — showed the same two vaults
as "Active vaults · Earning & operational", badge **OPERATIONAL**, a live SoC
readout and "12.2% Gross yield", under a page subtitle promising you can
"invest … earn yield, and trade your position". Nothing said they cannot be
bought until one click later.

The card *knew*: `isShowcase` was already switching the metric label between
"Gross yield" and "APY". But a wording change on a label is not something most
people parse as "you cannot buy this".

The card now states it, in the same footer slot where a pipeline card states
*its* availability ("Opens for fundraising next quarter"), using the same blue
dot `VaultDetail` uses — so the two surfaces read as one message rather than
two designs.

**The general lesson:** when a fix is about *what the user is told*, ask which
other surfaces make the same claim. A correction applied only where the problem
was noticed leaves the earlier, higher-traffic surface still saying the wrong
thing — and the overview is seen far more often than any detail page.

### …and it had not reached two more. Sweep by *field*, not by component

The entry above ended with "ask which other surfaces make the same claim". I
asked it by listing the components I could think of, found two, fixed both, and
considered it closed. That method finds the surfaces you remember.

Asking it mechanically instead — *who reads this field?* — found two more:

```
grep -rn "apyBps" src --include=*.tsx --include=*.ts
```

Five surfaces render `vault.apyBps`. Two named it correctly. Three did not:

| Surface | Before | Why it was wrong |
|---|---|---|
| `VaultCard` | "Gross yield" / "APY" | correct already |
| `VaultDetail` | "gross" / "APY" | correct already |
| `VaultsOverview` | **"APY"** for every row | column header, all six rows |
| `BessGlobe` tooltip | **"APY"** hardcoded | all six map markers |
| `portfolio` | "APY" | unreachable — `POSITIONS` is `[]` |

`vaults.ts` annotates the field at source — `apyBps: 1220, // gross yield on
capex (showcase headline)` — so both offending surfaces were printing a number
under a label the data itself contradicts. Worse, `VaultsOverview` *blends* the
two showcase gross yields into a "Total Deployed" figure and labelled that
"APY" too: today that group is 100% showcase vaults, so every APY figure in it
was a gross yield. A gross yield on capex and a depositor APY are not the same
promise, and the wrong one was the more favourable one.

Two lessons, and the second is the durable one:

1. **Status cannot stand in for kind.** `BessMarker` carried `status` but not
   `kind`, so the tooltip had nothing to branch on. A showcase site and an
   investable site can both be `operational` — the field that answers "can I buy
   this" has to be the one you carry.
2. **Enumerate by data, not by memory.** Components are what you recall; a field
   reference is what the compiler can enumerate. For any fix that changes *what
   a number is called* or *what a user is told*, grep the field and check every
   consumer. Four passes in a row found a missed sibling by hand; the first
   field-grep found two at once and proved the remaining three complete.

Guard the derived cases too. The group marker is computed
(`g.rows.every(r => r.vault.kind === "showcase")`), not hardcoded to "deployed":
add an investable vault to that group and the blend stops being purely gross,
the marker disappears on its own, and the per-row markers still carry the
distinction.

### The same sweep on `currency`: €240K + €2.20M = $2.44M

Ran the field-grep from the entry above on the next label-bearing field. Every
one of the six vaults is `currency: "EUR"` — the sites are in Slovenia, Serbia,
Germany, Lithuania and Romania. The per-vault figures honoured that, because
they pass `v.currency`. The **aggregates built out of those same fields** all
hardcoded `"USD"`.

The vault table rendered it side by side:

```
Total Deployed  2 vaults      $2.44M     <- hardcoded "USD"
  BESS Ljubljana 01            €240K     <- v.currency
  BESS Metlika 01             €2.20M     <- v.currency
```

240K + 2.20M = 2.44M. The same two numbers added up, with the other
continent's symbol on the result. Five places had it:

| Surface | Figure | Derivation |
|---|---|---|
| `/` (homepage) | TVL, Replacement Fund | `dashboardMetrics()` — Σ capex / Σ sinkingFundBalance |
| `dashboard-v2` | TVL tile, replacement-fund sub-line | `PROTOCOL.tvl` = Σ showcase capex |
| `dashboard-v2` | Cumulative Yield odometer | `Odometer`'s `prefix` defaults to `"$"` |
| `OverviewChart` | y-axis ticks, tooltip, a11y summary | `tvlSeries()` ← `PROTOCOL.currentlyDeployed` |
| `VaultsOverview` | legend, "Total:", both group totals | `allocation()` / `vaultGroups()` |

**The part that makes this worth writing down is what was *not* wrong.**
Deposits are RLUSD, a USD stablecoin, so every deposit / claim / balance figure
is correctly `"USD"` and had to stay. So did the whole marketplace, where
`faceValue = shares × 1.00` prices RLUSD-pegged receipt tokens, and the
portfolio, whose values derive from deposits. A blanket find-and-replace of
`"USD"` → `ASSET_CURRENCY` would have broken twelve correct call sites in
`VaultDetail` alone. **The field tells you where to look; it does not tell you
what the answer is.** Each of the ~30 hits had to be traced to its origin.

The rule that separates them, now encoded in `ASSET_CURRENCY`'s doc comment:
*asset-side* (capex, raised, annualRevenue, sinkingFundBalance, and anything
summed from them) is EUR; *deposit-side* (RLUSD) is USD.

Two traps worth remembering:

- **`Odometer`'s currency was a default parameter, not a call site.** Grepping
  `"USD"` does not find `prefix = "$"`. Anything with a currency default hides
  from a currency grep — check the components' signatures too.
- **The verification grep matched React's flight payload.** `$1`, `$5`, `$20`
  are RSC serialization refs, so `\$[0-9]` "found" five dollar figures on a page
  that has none. Same false positive as the 404 detector two passes back: strip
  `<script>` before asserting anything about rendered text.

If the founders actually want these presented in USD, the fix is a conversion
in the data layer, not a symbol — summing mixed currencies is a maths problem,
not a formatting one. That is flagged in `ASSET_CURRENCY` rather than guessed
at.

### A chart of zeros is worse than no chart

Continuing the "look at what actually ships" lens, Portfolio was rendering its
**Portfolio value** card with an empty dataset. `growthSeries()` returns 18
months of `{ principal: 0, interest: 0 }` — the source comment says so
outright, "none until XRPL fundraising opens" — and Chart.js given an all-zero
series scales its axis symmetrically about zero. The result was a y-axis
reading `$1, $1, $1, $0, $0, $-0, $-0, $-1, $-1`: repeated labels, and
**negative money on a portfolio that has never held anything**.

On a financial product that does not read as "no data yet", it reads as broken
— and it sat directly above a perfectly good "No positions yet" empty state
that already said the true thing. The card now waits until there is something
to plot.

Also dashed: **Avg APY**, deposit-weighted over zero deposits. Same
undefined-versus-zero distinction as the marketplace's avg premium; the
neighbouring "$0 deposited" and "€0.00 claimable" are genuine zeros and stayed.

**The single case is the one nobody sees.** Verifying the populated path with a
fixture — mandatory here, since gating the card changed control flow — is what
surfaced `"1 positions"`. Empty reads fine ("0 positions"), many reads fine
("6 vaults"), and exactly one is the case that never appears in demo data or in
an empty shipped state. There is now a `plural()` helper in `lib/format.ts`,
applied where a count can realistically be 1. English pluralises on `n !== 1`,
so zero takes the plural and `"0 positions"` is correct.

### The shipped app is mostly empty — look at it that way

`LISTINGS` and `POSITIONS` are empty and every vault is either a showcase or
`coming_soon`, so what a real
first-time visitor sees is almost entirely empty states. Several passes audited
those surfaces *with fixtures*, which is the right way to reach the layouts —
but it means nobody had looked at the app in the state it actually ships in.

Doing that found the Marketplace's most prominent element, a filled accent
**"Sell a position"**, opening a dialog that was a dead end dressed as a form:
a "Position" label over an empty group, "Max 0", a calculator returning $0.00,
and a disabled CTA that never said why. The user had no way to know what was
wrong or what to do next.

The principle was already written down in this codebase, in `VaultDetail`'s
deposit modal: *"a disabled button with no stated reason is a dead end."* It
simply had not been applied here. The dialog now shows the same shape of empty
state the marketplace's own listing area already uses — what is missing, why,
and where to go.

Two things worth carrying forward:

- **Verify the path you did not change.** Adding the empty branch restructured
  the dialog's control flow, so the populated path was re-tested with a
  fixture: position selected and `aria-pressed`, Max filling 24,000, CTA
  enabling, totals correct. A conditional that fixes the empty case and breaks
  the full one is a worse bug than the one it fixes.
- **An average over nothing is not zero.** "Avg premium +0.0%" read as a
  measurement — *listings are trading at face value* — when there were no
  listings to average. It shows an em dash and "No listings yet" now. The
  neighbouring "0" and "$0" are genuine counts and totals, so they stayed:
  the distinction is between a real zero and an undefined one.

### aria-label replaces the name — nothing was guarding the ones we wrote

Several `aria-label`s were added by hand across this work (the Buy button, the
portfolio rows, MAX, the chain indicator). `aria-label` **replaces** the
content name outright, so a well-meant description can silently break "click
Buy" for anyone driving the page by voice — WCAG 2.5.3. Nothing checked them.

`auditLabelInName()` now does, across every route, with **two severities**:

- `label-not-in-name` (**FAIL**) — the control's primary visible label is
  absent from its accessible name. The real 2.5.3 failure.
- `name-omits-visible-text` (**INFO**) — the name covers the label but drops
  other visible strings. Not a 2.5.3 violation, since 2.5.3 concerns the label
  rather than every string inside a control, but often a real parity gap.

The first version reported only the strict form and flagged five entirely
compliant band cards. **That distinction is the whole value of the check** — a
check that cries wolf gets switched off, and one that reports "5 failures" when
there are none is worse than no check.

It still earned its keep on the first run. The band cards — the game's primary
control — carried `"Calm, < 137 euro per megawatt hour"` while the screen also
showed `"23% of last 30d"`. That frequency is how a sighted player judges a
safe pick from a long shot, and it reached only people who could see it. The
name now ends `", hit 23% of the last 30 days"`.

Across 18 route/width pairs: **zero real failures.** The one standing INFO is
correct behaviour — the names say "euro per megawatt hour" where the screen
shows "€/MWh", because spelling the unit out is better for speech.

Note the ordering rule this depends on, already used for the Buy and MAX
labels: **put the visible label first in the accessible name.** "Buy 12,500
shares of …" passes; "Purchase …" would not.

**Test user-supplied fields with a string that has no break opportunity.** A
long name with spaces wraps fine and proves nothing; the failure mode needs a
single unbroken token. Display names come from a form with no `maxLength`, and
emails legitimately reach 60+ characters of unbroken domain. Whether the name
field should also gain a cap is a product call — the backend may already have
one, so it was not guessed at here.

### Keyboard order is clean — and two audit instruments were not

A tab-order pass across five routes found **nothing to fix**, which is worth
recording so it is not re-run blindly: no positive `tabindex` anywhere, no
focusable element that a sighted user cannot see, and no mechanism in the CSS
for visual order to diverge from DOM order (zero `order:` declarations, no
`*-reverse` flex direction). Focus order follows DOM order follows visual
order. The skip link is the standard `translateY(-160%)` → `translateY(0)` on
`:focus`, so it is rendered — and therefore reachable — while staying off
screen until wanted.

Getting there needed two corrections to the audit itself, both instructive:

- **`getComputedStyle(el).display` does not tell you whether an element is
  rendered.** A child of a `display: none` parent reports its *own* declared
  `display` — `inline-flex`, not `none`. The first run therefore reported the
  five desktop `.nav-link`s as "focusable but invisible" at 390px, a serious-
  sounding bug that does not exist: they sit inside a `display: none` wrapper,
  are not rendered, and are correctly skipped by the browser's tab order. The
  authoritative test is `el.getClientRects().length > 0`. Rerunning with it
  dropped the focusable count on `/` from 20 to 15 — exactly the five.
- **A DOM-vs-visual order heuristic that sorts by top-then-left needs a
  tolerance, and the tolerance generates false positives.** One "mismatch"
  survived on two routes; there is no `order` property or reversed flex
  direction anywhere in the stylesheet, so it could not have been real.

Both follow the rule already written above under the animation trap: check the
instrument against something you know before believing what it reports.

### Text contrast was solved; control *boundaries* were not (WCAG 1.4.11)

Several passes went into 1.4.3 — the seven-rung surface ladder, `--muted`
clearing 4.5:1 on all of them. **1.4.11 non-text contrast had never been
checked**, and it is a different requirement: 3:1 for the visual information
needed to identify a control.

Measured, not estimated:

| | value |
|---|---|
| `.input` fill vs the modal behind it | **1.04:1** |
| `.input` border (`--border-2`) vs its own fill | **1.40:1** |
| border width at DPR 1.5 | **0.67px** |

So a text field in the deposit and list-a-position modals was a two-thirds-of-a-
pixel hairline at 1.4:1 over a fill essentially identical to the surface behind
it. On the screen where someone types an amount of money, the field was very
nearly invisible. `.btn-outline` was worse in kind: `background: transparent`
plus that same border, so it was defined *entirely* by a boundary nobody could
see.

The fix is a new token rather than a change to the old ones:

```css
--border-control: rgba(255, 255, 255, 0.35);  /* measured: the alpha that
                                                 reaches 3:1 on the darkest
                                                 surface */
```

applied to exactly the five controls that are identified **by** their boundary
— `.input`, `.sc-field`, `.btn-outline`, `.btn-ghost`, `.seg`. Result: 3.11 to
3.21:1, with every fill unchanged.

**The token had to be solved against the LIGHTEST rung, not the darkest.**
0.35 was the alpha that reached 3:1 on `--bg` — and it failed on `--toast` at
**2.96:1**. That is precisely the mistake the `--muted` note above records
making twice, made a third time. Final value is `0.36`, measured on all seven
rungs: `--bg` 3.23, `--surface` 3.29, `--card` 3.33, `--card-2` 3.31,
`--elevated` 3.25, `--sheet` 3.16, `--toast` 3.04 (binding). Any future
boundary token gets checked against `--toast` first, since it is the lightest
surface and therefore always the constraint.

`--border` and `--border-2` are deliberately untouched. Cards, tiles and
dividers are decorative surfaces; 1.4.11 does not govern them, and raising the
tokens globally would coarsen the whole product to fix five components. **The
distinction worth keeping is "surface edge" versus "control boundary"** — they
were one token doing two jobs, and only one of the jobs has a contrast floor.

Two things that did pass, checked at the same time: the focus ring is
`2px solid var(--accent)` — brand green on near-black, comfortably over 3:1 —
and the primary `.btn` is identified by its fill at 12.66:1, so its border
never mattered.

### `display: none` on a label takes the name too, and `title` is not a substitute

Below 640px the chain indicator sheds its "XRPL" label for space via
`display: none`. That removes the word from the **accessibility tree** as well
as the screen, leaving the element named only by its `title` attribute — the
weakest naming mechanism there is: announced inconsistently across screen
readers, and completely invisible on touch, where hover does not exist.

The fix is to clip rather than remove (`position: absolute; clip-path:
inset(50%)` — the `.sr-only` declarations). The name survives at every width
and nothing changes visually; `.chain-btn` measures 37×44 before and after.

General rule: **when a responsive rule hides text that was serving as a
label, clip it, don't `display: none` it.** And treat `title` as decoration —
never as the only thing naming a control.

### A proportional bar drew a slice for a category worth $0

The allocation bar on `/dashboard-v2` renders each category with
`flexGrow: Math.max(s.value, 1)`, and the stylesheet gives every segment
`min-width: 2px`. Both guards exist so a tiny slice stays visible. Together
they meant a category worth **exactly zero** still painted a 2px stripe —
"Active vaults $0" and "Fundraising $0" each drew one, so half the segments in
the bar represented nothing.

That is not a styling detail. A proportional chart that shows a slice for
nothing misstates the data, which on a page about where money is deployed is
the one thing it must not do. Segments are now filtered to `value > 0`; the
`max()` guard stays for genuinely small non-zero values, and the legend still
lists the $0 categories as text, where "$0" is informative rather than
misleading.

The bar itself is now `aria-hidden`. The legend immediately below states every
label *and* value, so a screen reader was getting four empty spans whose only
content was a `title` — four disconnected phrases with no numbers and no sign
they described one bar — and then the same four categories again, properly,
from the legend. When a graphic has a complete textual equivalent beside it,
hiding the graphic beats describing it twice.

### Every font size was px, so the browser's font-size setting did nothing

`auditTextScale()` sat fully written in the harness for several passes without
ever being wired into `runAudit()`. The first time it was run it returned the
same verdict on all four routes it was pointed at: **0 of 45 sampled elements
responded to a 24px root**. Every `font-size` in the app was px — 151 in
`globals.css`, 96 inline in TSX — and `body { font-size: 16px }` pinned the
root preference outright. Browser zoom still worked; a raised *default font
size*, which is what people with low vision actually set, did nothing at all.

Converted mechanically: 151 CSS declarations, the one `--eyebrow-size` custom
property, and 89 inline `fontSize` values in TSX (the 7 in `wallet.tsx` are out
of scope by standing instruction). Every value divided cleanly by 16, so the
transform is exact — no rounding drift, and none was expected or found.

Two things made this safe to do in one sweep, and both are worth repeating for
any large mechanical change:

- **A before/after equality check, not a spot check.** Computed `font-size` was
  captured for ~1,050 elements across four route/width pairs *before* the
  change and compared after. All identical. That is what makes "240 edits, zero
  visual change" a measurement rather than a hope.
- **A positive control.** Zero findings after a big change is exactly what a
  broken check also returns. Re-running the audit and getting "clean" proved
  nothing on its own; setting the root to 32px and confirming a **median scale
  ratio of exactly 2.00** is what proved the text now scales.

At 200% on four routes at 390px: no clipping, no horizontal overflow. A 20-way
route × width regression sweep on a production build was also clean.

**A trap worth knowing**, which cost most of this pass: `getComputedStyle(el)
.fontSize` on a few container elements (`.connect-btn`, `.vault-card`) kept
reporting the unscaled value while an identical `0.6875rem` probe injected
beside them reported the scaled one. It reproduced on a production build, so it
was not dev-server staleness. The elements were rendering correctly the whole
time — `.connect-btn`'s box grew 38px→56px and `.vault-card`'s 197px→855px.
**Box geometry was the trustworthy signal; the computed-style reading was not.**
The one leaf that genuinely never scaled, `.chain-btn-name`, is `display: none`
at that width, and a hidden element does not get restyled.

`auditTextScale` now runs inside `runAudit()` on the first three routes.

### The two dialogs that handled money had no dialog behaviour

`Sheet` and `Onboarding` each carried a full, careful implementation — focus
trap, Escape, scroll lock, focus restore, `role="dialog"`, and a scrim that
listens on `mousedown` with a target check so a drag-select starting inside the
panel cannot dismiss it. Both files even explain *why* mousedown.

The deposit modal and the list-a-position modal had **none** of it. They were
`<div className="overlay" onClick={onClose}><div className="modal">` and
nothing else. So on the two surfaces where someone enters an amount of money:
Tab left the dialog on the first field, Escape did nothing, the page behind
scrolled under it on a phone, focus never entered or returned, screen readers
never heard "dialog", and releasing a text selection on the backdrop threw away
what had been typed.

The lesson is not "add a focus trap". It is that **the correct implementation
already existed twice and neither copy was reusable**, so the third and fourth
dialogs were written without it and nobody noticed. Behaviour that is subtle
enough to need a paragraph of justification is behaviour that belongs in one
place. It is now `components/useDialog.ts`, used by `Sheet`, `DepositModal` and
`SellModal`.

Extracted *from* `Sheet` rather than rewritten, so the version that was already
correct is the one that spread. One deliberate change on the way out: the
focusable-elements list gained `input`, `select` and `textarea`. `Sheet`'s
original omitted them, which was survivable only because no `Sheet` happened to
contain a form field — both new callers are mostly form, so the trap would have
leaked on the first input.

`Onboarding` keeps its own copy on purpose: it also manages a history entry for
Android Back, swipe gestures and arrow-key stepping, and folding those in would
make the hook worse at its one job. `wallet.tsx` holds a third bare modal,
out of scope by standing instruction and written up in `wallet-tsx-handoff.md`.

### A `div` that looks like a label is not a label

The app had **one** `<label>` element in it, and even that one had no
`htmlFor`, so it was attached to nothing. Every other form control was
labelled by a `<div className="field-label">` — correct to look at, and
semantically inert. The consequences are not subtle:

- The control has **no accessible name**. The deposit Amount field already
  carried `aria-invalid` and `aria-describedby`, so it announced "edit,
  invalid" without ever saying what it was for. It is the field that moves
  money.
- **Clicking the label does not focus the input.** Everyone expects that, and
  it costs nothing to have.
- The Spreadcast signup used placeholders as labels. A placeholder disappears
  the moment someone types, taking away the only cue at exactly the point they
  might want to check it — and it fails to name the field for AT at any point.

Fixed across all six reachable controls (`sc-join-email`, `sc-join-name`,
`sc-exact`, `sell-shares`, `sell-price`, `deposit-amount`). Two patterns worth
copying:

- Where the label row also holds a button (the "Max" affordances), the
  `<label>` wraps **only the text**. A `<button>` inside a `<label>` makes the
  click ambiguous — the label also forwards clicks to the input.
- Supporting text next to a label ("Balance: $12,340 RLUSD") belongs in
  `aria-describedby`, not in the name. The name stays "Amount"; the balance is
  still read, after it.

The signup is also a real `<form>` now, so Enter submits and password managers
recognise it, with `type="email"` / `autoComplete` so mobile gets the right
keyboard. **`type="button"` on every non-submit button inside a form** — the
default is `submit`, which is how a "Max" button ends up submitting a signup.

`wallet.tsx` holds a seventh control with the same problem. Out of scope by
standing instruction; recorded in `wallet-tsx-handoff.md`.

### Selected state carried by colour alone

Seven single-select button groups signalled their choice with nothing but an
`.active` class — a background colour. That is WCAG 1.4.1 (use of colour) for
sighted users and 4.1.2 (name, role, value) for assistive tech, which heard a
row of identical buttons and no indication which was chosen. None of the groups
had a name either.

Fixed on: both `OverviewChart` ranges, `SiteChart` range and units,
`VaultsOverview`'s two tabs, and the sell modal's position picker — each button
gets `aria-pressed`, each group a `role="group"` and an `aria-label`.
`SectionBar`'s nav links get `aria-current="page"` instead, because they are
navigation and "current page" is the state that matters.

Deliberately **not** `role="tab"`/`role="radio"` on the button groups: those
contracts also promise arrow-key navigation and a single tab stop. A
half-implemented tab pattern reads as broken, where plain buttons with
`aria-pressed` read as exactly what they are. The Spreadcast band picker is a
real `radiogroup` and does implement the keyboard contract — that is the bar
for using the role.

### Empty demo data hides whole layouts from every audit

`LISTINGS` and `POSITIONS` are both `[]`. Sweeping `/marketplace` at seven
widths therefore reported a clean page at every one of them — `.mk-head` was
`display: none` everywhere and `.mk-row` never existed. **Two breakpoints of
row CSS had never once rendered**, in this browser or any other, and the audit
could not tell the difference between "correct" and "absent".

This is now the **third and fourth** time the same blind spot has bitten. The
investable path is unreachable too — though **not** because `investableVaults()`
is empty, as an earlier version of this note claimed. It returns **four**: the
pipeline vaults are all `kind: "onchain"`. They are also all `status:
"coming_soon"`, and both deposit triggers are `disabled={isComing}`, so the
gate is the *status*, not the kind. The entire investable path — the
deposit modal, its Amount field, the MAX button, `SiteChart`'s controls on an
onchain vault — renders for nobody. Flipping one vault to `kind: "onchain"`
for the length of an audit is enough to reach all of it, and immediately turned
up a MAX button at 43×24 scraping the WCAG 2.5.8 floor, plus a suffix
overlapping 15px more of the input than its `paddingRight` reserved.

So: before trusting a pass over a data-driven surface, check that the data is
non-empty. If it isn't, populate it temporarily from the real interface in
`src/lib/types.ts` (not from what the screen appears to show — see the
`GrowthPoint.yield` mistake), audit, then revert with `git checkout --` and
confirm with `git status`. Writing the file back through PowerShell flips CRLF
to LF and leaves it modified with an empty content diff; `git checkout --` is
what actually restores it.

**Put the fixture in a different file from your real work.** A temporary
override was once patched into `PlayView.tsx` while that same file held
finished, uncommitted label changes; `git checkout --` to drop the override
took the real work with it. Either commit first, or confine the fixture to a
data file you can revert on its own.

Portfolio additionally gates on a connected wallet, so its rows stay invisible
even with data present. `localStorage` keys `mw.xrplAddress` / `mw.xrplVia`
control that. Capture the previous values first and restore them after —
leaving the dev session in an unexpected auth state has already cost one pass.

### Clickable rows are a list, not a table

The vaults side renders its tabular data — portfolio positions, marketplace
listings — as `.drow` grids with a `.drow-head` label row, and carries **no
table semantics at all**: no `<table>`, no `role="table"`, no column
association. Spreadcast uses real `<table>` elements. So a value like "$12,400"
has nothing tying it to the "Deposited" header above it.

The obvious fix is the wrong one. Those rows are `<a>` elements — clicking one
opens the vault — and putting `role="row"` on a link destroys its link
semantics. That is *why* they are divs, and it is a reasonable choice.

The right fix is to treat them as what they are: a list of links, each of whose
**accessible name** carries its own values ("BESS Ljubljana 01, $12,400
deposited, $340 claimable, 8.2% APY"), with the header row `aria-hidden` since
it labels columns that do not semantically exist.

**Done.** It was deferred while `POSITIONS` and `LISTINGS` were empty, on the
grounds that a naming strategy you cannot read back is one you cannot verify.
The temporary-fixture technique above removes that objection, so the names were
written and then actually read at 390px and 1024px:

- Portfolio rows are `<Link>`s carrying
  `"BESS Ljubljana 01, Ljubljana, Slovenia. Deposited $24,000.00, claimable
  €812.44, APY 12.2%."` — previously the name was the raw text content,
  `"…24,000 mwLJU01 $24,000.00 €812.44 12.2%"`, four bare figures in a row.
- Marketplace Buy buttons carry `"Buy 12,500 shares of BESS Ljubljana 01 for
  $12,125.00"`. Every listing previously rendered a button whose entire name
  was "Buy", so a screen reader heard "Buy, button" once per row with nothing
  to distinguish them.
- Both `.drow-head` strips are `aria-hidden="true"`: they label columns that do
  not semantically exist, so they were pure noise.

Note the ordering constraint that made both names safe: the visible label comes
**first** in the accessible name ("Buy …", "BESS Ljubljana 01, …"). WCAG 2.5.3
requires the accessible name to contain the visible label, and speech-input
users say what they see — `aria-label` replaces the content name outright, so
putting the description first would have broken "click Buy".

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
### `.sc-cta-dock` — audited, correct, and mostly inert by design

It renders only inside the band picker, which renders only while a round is
open, so outside that window it does not exist at any viewport. Forcing
`{state.user ? …}` to `{true ? …}` does **not** reach it — the gate that
matters is the round, not the session.

It was reached by temporarily overriding `useRound()`'s `state.open` and
`isOpen` in `PlayView.tsx` (fixture technique, reverted). One trap in doing
that: `isOpen = true` is not safe on its own, because code above the `if
(!state) return <skeleton>` guard reads `state!.open` under exactly that
invariant. Use `!!state`, or the component throws on first paint.

With the real dock in its real position, across 320×568, 360×640, 390×844,
414×896, 768×1024, 980×800 and 740×360 landscape:

- **It never collides with the tab bar.** At every viewport and scroll
  position the CTA either clears `.bottom-nav` or is off-screen. The
  `bottom: var(--nav-h-safe)` choice over `bottom: 0` holds up.
- `--nav-h-safe` is 74px against a `.bottom-nav` measuring 74.54px (74px + a
  0.67px top border). A 0.54px shortfall — under one device pixel at DPR 1.5.
  Left alone; recorded so it is not rediscovered as a finding.
- **The sticky rule is a no-op at most phone sizes.** `.sc-panel` measures
  ~529px at 390×844 and ~468px at 768×1024 — shorter than the viewport, so
  there is nothing to scroll and the dock never leaves its natural position.
  Only at 320×568 (panel 583px) is the panel taller than the screen. There is
  95px of panel content below the dock at every size, so even when sticky does
  engage its total travel is 95px.

That last point is **not a bug** — a sticky element that has nothing to scroll
past is supposed to sit still, and the CTA is fully visible either way. It does
mean the docked treatment earns its keep only on short viewports. Worth knowing
before anyone "fixes" it into `position: fixed`, which would pin the CTA over
content that does not need covering.

**Caveat now resolved (2026-08-02).** The fixture round rendered four bands; a
real one renders five. A genuinely open round with a joined session was caught
and re-measured, no fixtures involved: the dock renders, and across sampled
scroll positions at 360×640 and 390×844 the CTA **never collides with the tab
bar** — minimum gap 42px and 30px respectively, zero collisions. The `bottom:
var(--nav-h-safe)` choice is confirmed against real content.

One honest gap in that re-measurement: sampling at ten evenly-spaced scroll
offsets never caught the dock *pinned*, but the pin window is only ~95px wide
and the step size was larger than that, so absence of a pinned sample is not
evidence it never pins. The finer scan that would settle it hung the degraded
dev server twice. The collision result does not depend on it — it holds at
every position sampled, pinned or not.

**Two probe mistakes worth not repeating**, both of which produced confident
wrong answers before the above was reached:

- **The onboarding sheet was open during the first readings.** Its scroll lock
  sets `document.body.style.overflow = "hidden"`, so every scroll-dependent
  measurement in that pass was taken against a locked body. Any sweep that
  scrolls must pass `?onboarding=0` — that override exists for exactly this.
- **An injected synthetic dock is not in the real dock's position.** Readings
  swung between "stuck 4px above the nav" and "200px below the fold" based only
  on where the probe scrolled to. Both were meaningless. If an element's
  behaviour depends on its position in a layout, you cannot audit it by
  building a copy somewhere else.
