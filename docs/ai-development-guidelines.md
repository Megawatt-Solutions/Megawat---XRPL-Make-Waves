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

### One status, three words — the map was duplicated, so it drifted

`STATUS_BADGE` existed twice. The copies had diverged on exactly one key:

| Surface | `coming_soon` rendered as |
|---|---|
| `VaultCard` (homepage, marketplace) | "Coming soon" |
| `VaultsOverview` (dashboard table) | **"Pipeline"** |
| `BessGlobe` tooltip | **"coming soon"** — `status.replace("_", " ")` on the raw enum |

Four vaults, three names, one status. Patching the table to say "Coming soon"
would have fixed today's symptom and left the mechanism — two maps, no
compiler relationship between them — intact for the next status to drift.
Both copies were deleted and replaced with one `vaultStatus.ts`.

**Choosing between the two words was the actual design decision**, and
"Pipeline" lost for a reason better than "the other one is more common". The
dashboard table already groups its rows under a "Total Pipeline" header, so a
badge reading "Pipeline" on every row inside that group restated the header. It
also flattened a live distinction: that group can hold `coming_soon` *and*
`fundraising` vaults, which need telling apart from each other rather than
labelling with the name of the bucket they share. The other three labels all
describe the vault's own state — "Pipeline" was the only one naming a
container. It stays where it genuinely is one: the group header, and
`VaultDetail`'s phase heading.

Two details worth carrying forward:

- **The drifted copy was typed `Record<string, …>`; the correct one was
  `Record<Vault["status"], …>`.** The weaker type is how they got out of sync
  without anyone noticing — a new status would have been a build error in one
  file and an `undefined` crash on `badge.cls` in the other. The consolidated
  map uses the strict key type.
- **Width was provable rather than measurable.** `.badge` is
  `font-family: var(--mono)` and uppercase, so "COMING SOON" is exactly as wide
  as "OPERATIONAL" — 11 characters either way — and the Status column is
  already sized for the latter (globals.css says so in two media queries).
  Monospace turns a layout question into a character count.

### "Responsive" was an argument, not a measurement — until the browser worked

Every responsive claim in these notes up to this point was reasoned from CSS and
box arithmetic, because the Playwright MCP server hung on every call. The cause
turned out to be mundane: **no browser was installed**, so it was stalling on a
Chromium download. Installing it did not fix the hang — the MCP server is
broken here independently — but it made the direct route viable.

Node 24 ships a global `WebSocket` and Chrome speaks the DevTools Protocol over
one, so `scripts/responsive-audit.mjs` drives the browser with no dependencies
and no MCP server: launch headless with `--remote-debugging-port`, attach flat
to a target, `Emulation.setDeviceMetricsOverride` per width,
`Runtime.evaluate` with `awaitPromise`. Roughly 120 lines of protocol glue buys
the whole matrix.

**Result of the first real sweep — 10 routes × 10 widths, 320→1440px:**
zero horizontal overflow, zero clipped text, zero errors. The reasoning had
been right. That is worth knowing rather than assuming, and two arguments made
earlier in this session were confirmed to the pixel:

- `.v2-avail` wraps to exactly 2 lines with the `nowrap` span intact, so
  "not investable" never strands on its own line.
- "COMING SOON" measures **95px** — identical to "OPERATIONAL" at 95px. The
  monospace character-count argument was exact, not approximate.

**The one thing measurement found that reading had not:** `.nav-brand`
(121×21 at 1024, 132×23 at 1280) and `.back-link` (90×21) both fell under the
24px minimum target size, WCAG 2.5.8. On *every page in the app*, and only on
desktop — they are not rendered at mobile widths, which is the opposite of
where you would look. Both were already centred flex containers, so a
`min-height: 24px` grows the hit area without moving the text; `.back-link`
gave the 3px back out of its own `margin-bottom` (18→15), keeping its total
footprint at 39px exactly as before.

Two notes on the instrument itself:

- **Suppress intentional clipping or the report is all noise.** `.sr-only` is
  clip-path'd to 1px forever and `.chain-btn-name` is clipped rather than
  `display: none` on purpose — both report `scrollWidth >> clientWidth` on
  every page, every width. Same for anything inside `overflow-x: auto`: the
  vault table is *designed* to scroll sideways below 641px.
- **The canary must run the same filters as the check.** The first version
  dropped the scroll-container filter, so it reported a baseline of 46
  overflows on a clean page. The assertion still passed — it is relative — but
  a canary that prints 46 findings next to the word "baseline" teaches the next
  reader something false. With the filter matched it reads 0 → 41 → 0.

Run it with `node scripts/responsive-audit.mjs` against a **production** build
(the dev server recompiles under a sustained sweep and timings drift), and
`--canary` first if you have changed the checks.

### The sibling four lines away — `display: none` on the network tag

Looking at the app for the first time (screenshots, finally) surfaced this: at
phone widths the chain indicator renders as a bare XRPL mark, and the two
children of that one button are treated differently.

```css
@media (max-width: 560px) {
  /* Network tag and avatar are decoration; the address is the payload. */
  .chain-net { display: none; }        /* MAINNET — gone from the a11y tree */
  ...
}
/* elsewhere: .chain-btn-name is CLIPPED, with a comment explaining that
   display:none takes the word out of the accessibility tree */
```

An earlier pass fixed `.chain-btn-name` and wrote the reasoning down. The
sibling in the same button, in the same header block, kept `display: none`.
That is the fourth instance of a fix landing on one surface and not its
neighbour — but the smallest scope yet: not another page, not another
component, the next line.

**The comment is what made it look correct.** "Network tag and avatar are
decoration" is true of the avatar, an identicon carrying nothing. It is not
true of the network tag: mainnet-vs-testnet is the most safety-relevant word in
a crypto app's header. Mislabelling it as decoration is what justified hiding
it. Clipping saves exactly the same horizontal space and keeps the word at
every width — verified, the button is still 38×44 at 390px and 140×35 at 1440.

**Two instrument failures on the way, both worth keeping:**

1. **A page-wide search for "MAINNET" in the accessibility tree returned `true`
   in every state — including with `display: none` forced back on.** The status
   ribbon at the top of every page reads "XRPL — MAINNET", so the search was
   always matching a different element. Same family as the 404 detector that
   matched the RSC flight payload: *a search that cannot fail is not a test.*
   The fix was to stop searching text and start asking about a node —
   `DOM.querySelector` → `Accessibility.queryAXTree` on that subtree.
2. **`ignored: true` on the span is not the answer either.** A bare `<span>` is
   always ignored as an element (`ignoredReasons: ["uninteresting"]`); what
   matters is whether the text inside it survives. The reasons do differ —
   `uninteresting` when clipped, `notRendered` when hidden — but reading the
   subtree text is the unambiguous test:

   | State | AX subtree of `.chain-btn` |
   |---|---|
   | clipped (shipped) @390 | `XRPL, XRPL, MAINNET, MAINNET` |
   | `display:none` @390 | `XRPL, XRPL` |
   | desktop control @1440 | `XRPL, XRPL, MAINNET, MAINNET` |

**And the audit had been looking at the wrong thing entirely.** Every sweep run
gets a throwaway browser profile, so localStorage is empty and the first-run
onboarding sheet opens over *every route*. The previous pass's "100 runs, all
clean" was 100 runs of the modal, not the pages. The geometry conclusions
survive — elements behind a scrim keep their real boxes — but the pages had
never been audited in their normal state. `responsive-audit.mjs` now appends
the app's own `?onboarding=0`, with `--with-onboarding` to audit the sheet
deliberately. Re-run both ways: clean both ways.

Worth noting one non-finding. The onboarding "Skip" control *looks* washed out
in a screenshot, and measuring it said **6.55:1** — comfortably past 4.5. It
reads quiet because it is small uppercase grey beside bright content, not
because it fails. Contrast is one of the things an eye is worst at estimating.

### The marketplace settled in a token the protocol does not use

Seen by looking at the page, not by grepping. The marketplace header read
**"Settled in USDC"**, and its sell form asked for **"Price / share (USDC)"**.
Everywhere else the app says otherwise:

| Surface | Statement |
|---|---|
| dashboard ribbon | "Tokenization: XRPL MPT · **RLUSD** settlement" |
| dashboard footer | "XRPL Mainnet · MPT receipt tokens · **RLUSD** settlement" |
| `WalletModal` | "Vault deposits settle in **RLUSD** — you'll be asked to set the **RLUSD** trustline" |
| marketplace | "Settled in **USDC**" |

USDC (Circle) and RLUSD (Ripple) are different assets from different issuers.
This is not a synonym or a stale brand name — it named the wrong token on the
one page that is entirely about moving value between holders, where a reader
acting on it would prepare the wrong trustline.

**The root was in the type comments**, and it is the same shape as the currency
bug two entries up: `types.ts` described amounts as "USDC dollars" and
annotated `deposited`, `pricePerShare` and even `capex` as USDC. `capex` is a
vault's build cost in **EUR**, so that one comment was wrong twice over. The
comments are corrected and now state the rule explicitly — asset-side figures
are in the vault's `currency` (EUR), deposit-side figures are RLUSD — because
a wrong comment at the type definition is how a wrong word reaches a user.

**Two things checked and deliberately left alone**, which is the other half of
a design pass:

- The marketplace's primary CTA "Sell a position" is prominent while nothing
  can be sold. But it opens a modal that says "Nothing to list yet", explains
  that no vault is open for deposits, and offers two ways out. Leading a user
  into a modal to be told "no" is mild, and keeping the affordance discoverable
  is a defensible product call. Not a defect.
- The onboarding "Skip" looked washed out; measured **6.55:1**. Fine.

**Focus visibility (WCAG 2.4.7) audited for the first time** — every
interactive element focused in turn, comparing the full computed signature
(outline, box-shadow, border, background, colour) before and after. 64
focusable elements across three routes, **zero** without a visible focus
change. Canaried at 0 → 9 → 0 by force-killing focus indicators, because a
check reporting zero is exactly what the MAINNET search did while being
broken.

### One page, one label, two numbers — and a first conclusion that was backwards

The dashboard's "Yield Composition" tab was four hardcoded percentages —
74 / 14 / 8 / 4 — on a page where every other figure derives from `VAULTS`.
They matched no vault. The real capex-weighted blend understated the sinking
fund by a third and the reserve buffer by about 40%. It now derives, and each
row shows both the share and the yield it represents, because a composition
chart that only gives percentages never says what they are a percentage *of*.

**The part worth writing down is the investigation going the wrong way first.**

Comparing the vault detail page against the dashboard, `bess-belgrade-01`
looked broken: its `split` summed to 2650 bps where every other vault's summed
to ~1240-1340, and its depositor share came out at 49% against ~70% elsewhere.
Five agree, one differs — obviously the one is wrong. I wrote that into a code
comment as established fact.

It was backwards. Checking against ground truth — `annualRevenue / capex`,
which neither field can argue with — Belgrade's revenue really is 26.0% of its
capex. Its split is right; it is a denser site. What is actually inconsistent
is **`apyBps`**:

| | five vaults | bess-belgrade-01 |
|---|---|---|
| `apyBps` equals | `splitSum` == `revenue/capex` (**gross**) | `split.depositorBps` (**depositor share**) |

One field, two meanings — and `types.ts` documented it as "headline depositor
APY", which is true of exactly one vault.

**The user-visible symptom nobody would find by reading code:** VaultDetail's
"Project details" row labelled *Depositor APY* renders `apyBps`, while the
Yield breakdown card beside it renders `split.depositorBps`. So BESS Leipzig 01
shows **"Depositor APY 12.4%"** and **"Depositor APY 8.8%"** on the same page.
Belgrade shows 13.0% twice and looks fine, which is why the odd one out looked
like the healthy one.

Two rules came out of this:

- **A majority is not ground truth.** Five-against-one is a strong prior and it
  was wrong here. There was an independent check available the whole time —
  revenue ÷ capex — and it settles in one line what counting votes could not.
  When fields disagree, find the quantity neither one derives from.
- **Do not write a conclusion into a comment before testing it.** The wrong
  version shipped into `protocol.ts` for as long as it took to check, and a
  confident comment is the most durable kind of wrong: the next reader inherits
  it as fact. That is exactly how `apyBps` got its misleading comment.

Deliberately NOT fixed: which meaning `apyBps` should take. Every headline
yield figure in the product — the cards, the vault header, the overview table —
reads from it, so choosing changes marketing numbers downward (12.4% → 8.8% on
Leipzig). That is a founder call, flagged at the type definition and here.
`split.*` is the field to trust meanwhile, and `yieldComposition()` reads only
that.

### Describing the data is not the same decision as fixing it

The entry above ended by calling the `apyBps` problem blocked on a founder
decision. Half of it was. The two halves are worth separating, because the
distinction is reusable:

- **What should `apyBps` mean?** A product decision. Resolving it moves headline
  yield figures downward (Leipzig 12.4% → 8.8%). Still not mine.
- **What does `apyBps` currently hold, on this vault, right now?** A fact,
  answerable in one line, and the labels were getting it wrong.

Five surfaces guessed at it from `kind`, on the theory that showcase vaults
quote gross and on-chain ones quote APY. The data does not say that. BESS
Leipzig 01 is on-chain and its `apyBps` is a gross yield, so its card said
"APY" over one. `apyBpsIsGross(v)` — literally `v.apyBps === grossYieldBps(v)`
— is exact where the guess was merely usually-right, and every surface now asks
it instead:

| Surface | before | after |
|---|---|---|
| VaultCard metric label | `kind` | `apyBpsIsGross` → 5 cards now read "Gross yield", 1 reads "APY" |
| VaultDetail hero sub-line | `kind` | Leipzig "12.4% **gross**" (was "12.4% APY") |
| VaultDetail hero tile | `kind` | same |
| VaultDetail project details | hardcoded "Depositor APY" | "Gross yield on capex" when it is one |
| VaultDetail deposit panel | hardcoded "Projected APY" | "Projected gross yield" when it is one |
| VaultsOverview row/group marker | `kind === "showcase"` | 5 rows marked, was 2 |

**No displayed number changed.** Only what each one is called. That is the line:
relabelling says what the figure is, reassigning would say what it ought to be,
and only the second needs someone with authority over the product.

This also retires the same-label-two-numbers defect — Leipzig's page no longer
says "Depositor APY 12.4%" beside "Depositor APY 8.8%", because the first one
now correctly reads "Gross yield on capex". Belgrade, whose `apyBps` genuinely
is a depositor share, still reads "Depositor APY 13.0%" in both places and was
left alone by the same predicate that changed the others.

Note the earlier fix this supersedes. Two passes ago the overview table gained a
"gross" marker keyed on `kind === "showcase"` — 2 rows. It was right about the
problem and wrong about the trigger, and it took ground truth (revenue ÷ capex)
to see that. A fix built on a plausible-but-untested premise looks exactly like
a correct one until something independent contradicts it.

### Rotate the phone: the connect button was unreachable

Every viewport tested until now was portrait. Rotating gives a *short* viewport,
and that is a different failure mode entirely — nothing about width predicts it.

At **844×390** the `.modal` is 487px tall inside a `position: fixed` `.overlay`
that had no `overflow-y`. Measured:

```
modal height        487   viewport height 390
"Open in Xaman app" bottom = 449          (59px below the fold)
reachableByScrolling: null                (no scroller moved it)
scrollIntoView():     no effect
```

**On a landscape phone you could not connect a wallet.** The same `.modal`
backs the Sell and Deposit flows, so all three were affected.

The rule already carried a comment about being fixed for exactly this reason:

> *"This was invisible for the whole rehaul because the route sweep never opened a modal."*

An earlier pass fixed `.overlay`'s **width** overflow and left its **height**
overflow, in the same rule. Fifth instance of a fix landing on one axis of a
problem and not the other.

**`safe center` is the fix, not `center`.** Plain centring in grid (and flex)
splits overflow evenly and pushes the *top* out of the box as well, unreachable
in the other direction — the classic centred-overflow trap, where "fixing" the
bottom strands the header. `safe` falls back to start-alignment the moment
content stops fitting. Verified both ends: at `scrollTop: 0` the modal top sits
at 20px (the overlay padding), and `maxScroll` is exactly the 137px of overflow.
Centring is untouched where it fits — gaps measured 168/168, 65/65, 206/206 at
390×844, 320×658 and 1440×900.

`.sheet-panel` already did this properly, with `max-height: min(88svh, ...)`
over a scrolling `.sheet-body`. Two overlay primitives, and only one knew about
short viewports.

**The audit passed this before it caught it, and the reason is worth keeping.**
The first version credited `document.body` scrolling as "the content is
reachable". Body scrolling is irrelevant once the panel is inside a
`position: fixed` ancestor — the page moves and the overlay does not. The check
now ignores `bodyScrolls` when anything in the chain is fixed. Canaried against
the shipped CSS by reverting it in the live page: `overflow-y: visible` +
`center` → CTA unreachable; restore → reachable.

`node scripts/overlay-audit.mjs --widths 658,844` for landscape. One overlay
stays unaudited: the Spreadcast provably-fair `Sheet` needs a committed
prediction, and reaching it would mean submitting one in a live daily game on
the user's account. Its CSS was checked instead — capped height over a scrolling
body, structurally safe.

### Landscape, continued: the pages were fine, and two checks were not

Having found the landscape modal bug, the obvious follow-up was whether the
*pages* survive a short viewport. `responsive-audit.mjs` now carries landscape
heights (658×320, 800×360, 844×390, 896×414) — **40 runs, zero findings.**
Worth having asked; the answer was no defect.

Two instrument corrections came out of chasing it, both of the same shape as
earlier ones:

- **"Fixed chrome is 33% of the viewport" was wrong.** The sum counted
  `.skip-link`, which sits at `top: -64` until focused. Filtering on
  "docked to an edge" caught an element that is deliberately *off* the edge.
  Real figure: the 59px bottom bar, 18% of a 320px-tall screen.
- **"A control is covered by fixed chrome" fired on a false positive.** After
  scrolling to the bottom, a vault row sat under the sticky top nav — which is
  what sticky headers do, and is resolved by scrolling up. The defect worth
  detecting is a control under fixed chrome *at every scroll position*, which
  is the bottom-bar case. That one reported clean, so the pages have correct
  bottom padding.

Also checked and unfounded: `.bottom-nav` appearing at 844px wide looked like
duplicate navigation, but `.nav-links { display: none }` and
`.bottom-nav { display: flex }` share the same `max-width: 980.98px` boundary.
They are complementary. Two navs are visible at no width.

**Closing the loop on the overlay fix, for keyboard rather than touch.** With
`overflow-y: auto` on `.overlay`, focusing an off-screen control now scrolls it
into view: "Open in Xaman app" lands at top 266 / bottom 312 in a 390px
viewport, both controls on screen. A clipped overlay could not have done that,
so the fix serves keyboard users and not just scrolling thumbs.

That test also turned up something to hand over rather than fix: the connect
modal has **no close button**, and **Escape does not close it** — measured, not
read. The only way out is tapping the backdrop, which has no affordance, so a
keyboard user cannot dismiss it at all. It lives in `wallet.tsx` and is already
item 5 of `docs/wallet-tsx-handoff.md`; that entry now carries these
measurements and a note that it is a dead end rather than a degradation.

### 200% text: the tab bar left the screen, and my first fix broke 320px

151 px font-sizes were converted to rem specifically so the browser's text-size
setting works. That conversion was never *measured*. It does work — `html` has
no pinned `font-size`, there are zero px font-sizes left in the stylesheet and
zero inline ones, and an `h1` goes 39px → 78px at a 32px root.

What the conversion did not survive is layout. At 200% (WCAG 1.4.4) on a 390px
phone:

| | before | after |
|---|---|---|
| `.bottom-nav-item` | right=**398** in a 390px viewport — fifth tab off-screen | fits |
| `.odometer` | 377px wide, low-order digits of a money value cut off | scrolls |
| `.globe-tip` | 457px wide, `nowrap`, off-screen | 366px, wraps |

**The first fix was wrong and the measurement caught it.** `flex: 1` +
`min-width: 0` removes the min-content floor, which stops the 200% overflow —
but `flex: 1` means `flex-basis: 0`, so every tab becomes *exactly equal*. At
320px that produced `[57,57,57,57,57]` and truncated "Spreadcast" and
"Marketplace" **at normal text size**, where the original floor had sized them
`[53,53,60,53,66]` with everything fitting. Fixing 200% is not worth breaking
320px.

`flex: 1 1 auto` + `min-width: 0` is the version that holds both ends: a
content-aware basis, so longer labels still start wider and nothing truncates
at any normal-size width (measured 320/360/390/430), and no min-content floor,
so the bar still shrinks rather than overflowing at 200%.

The lesson is about the shape of the check, not flexbox. **Verifying the fix at
the size that motivated it would have passed.** The regression was two
breakpoints away, at normal text, in the state that is not the one being
debugged. After changing how something sizes, re-measure the *other* end of its
range — and diff against the previous behaviour rather than against "does it
look fine", which is how `[57,57,57,57,57]` would have gone unnoticed.

Left as a known limitation: `.globe-tip` still exceeds the viewport at 200%,
now by position rather than width. It is centred on a globe pin, so a pin near
the right edge puts a 366px tooltip 10-21px over the edge no matter how narrow
it is. Solving it means clamping in `BessGlobe`'s per-frame rAF loop, which is
a poor trade for a hover-only affordance on touch devices at 200% text. It
costs nothing at page level — `documentElement.scrollWidth` stays exactly
`innerWidth` at both text sizes, so no horizontal page scroll appears.

Also measured this pass and clean: **text contrast across the whole app** —
1929 text nodes over 10 routes at 390px and 1280px, compositing each element's
real background through translucent ancestors. Zero failures against 4.5:1
(3:1 for large). Canaried at 0 → 265 → 0 by forcing `#3a3a3a` text.

### Non-text contrast: 30 failures that did not exist, then one that did

Text contrast was measured last pass. This is its complement — WCAG 1.4.11, the
3:1 a control needs to be distinguishable from its surroundings, and to show
its **state**. `--border-control` was solved by hand against the lightest
surface in the app, and hand-solved values are exactly what drifts.

**The first run reported 30 failures, all at `0.00:1 via none`.** Every one was
the instrument:

1. **`color-mix()` does not compute to `rgba()`.** It computes to
   `color(srgb 0.498039 0.658824 0.85098 / 0.08)`. An `rgba?\(` regex reads
   every one of them as "no colour", i.e. as a control with no fill and no
   border. This stylesheet uses `color-mix()` for most tints, so the parser was
   blind to most of the app.
2. **Only `border-top` was inspected.** `.site-row` carries its boundary on
   `border-bottom`; `.seg-btn.active` on `border-left`. A top-only read called
   both unbounded.

A ratio of exactly `0.00` should have been the tell — it does not mean "very
low contrast", it means "nothing was measured". A real failure has a real
number.

Third correction, this one to the standard rather than the code: **a control
with no fill and no border is exempt.** Its text identifies it and 1.4.3 covers
that; 1.4.11 does not demand a boundary the design never drew. 52 of 208
controls are text-only. Counting them as failures would have meant restyling
the app to satisfy a misreading.

**What survived all of that was one finding.** The range selector
(1W/1M/3M/1Y/ALL) marked its selected segment with a 12%-alpha tint and an
accent text colour — measured against an unselected sibling, **1.29:1** on fill
and **1.73:1** on text. Both under 3:1, on the visual information whose whole
job is to say which range you are looking at.

The fix reuses the app's own idiom rather than inventing one: `.v2-tab.active`
and `.nav-link.active` both mark themselves with an accent underline, so
`.seg-btn.active` now does too, via `inset box-shadow` so nothing shifts by a
pixel inside a bordered group. Measured after: **11.55:1**, against
`.v2-tabs`' existing **12.18:1** — the same language at the same strength.

Two neighbours were measured and left alone, which is the other half of the
job: `.v2-tabs` already passed at 12.18 (its accent underline — my first check
reported "fill 1.00" because it only compared fills), and the Spreadcast band
cards, the core interaction of the game, already mark selection at **7.42:1**
with `aria-checked` flipping correctly.

### The header called itself navigation, so there was no banner

Document structure — headings, landmarks, focus order — is how a screen-reader
user moves around a page, and none of it had been measured. Most of it is
already right: one `h1` per route, no skipped heading levels, one `main`, every
`nav` uniquely named, a skip link whose target exists, and no positive
`tabindex` anywhere. The only control outside every landmark is the skip link
itself, which is where a skip link belongs.

One thing was wrong, and it was structural rather than cosmetic: the top bar
was `<nav aria-label="Main">` wrapping the brand, the chain indicator, Connect
Wallet **and** the links. Two consequences:

- **`banner` measured 0 on all ten routes.** There was no site-header landmark
  to jump to.
- The wallet and chain controls lived inside a *navigation* landmark, which is
  not what they are. A screen-reader user listing navigation landmarks was
  offered "Main" and found a connect button in it.

Now `<header className="nav">` with a `<nav className="nav-links"
aria-label="Main">` inside it wrapping only the links. `banner=1` on every
route at 1280px and 390px; the navigation landmark contains only things that
navigate.

**The reason this was safe to do is worth naming.** Every rule for this bar is
class-based — `.nav`, never `nav` — so the element name is free to change. That
was checked before editing, not after: `grep` for element-based `nav`/`header`
selectors returned only comment text, and nothing in the app queries by tag.
Geometry after the swap is identical to what earlier passes recorded: bar 58px
tall, brand 24×132, links hidden at 390px.

At mobile the raw `nav` element count still reads 2 because `.nav-links` is
`display: none` rather than absent — which removes it from the accessibility
tree, so a phone user gets banner + the "Sections" tab bar, correctly.

### Reduced motion, finally measured — and a comment that was wrong

`usePrefersReducedMotion` was written from reasoning: CSS already clamps
animations, but it cannot stop a `requestAnimationFrame` loop, so the two
kinetic JS loops (the odometer's reels, the globe's idle spin) had to read the
setting themselves. None of that was ever observed. CDP can emulate the media
feature, so it can be now:

| | motion allowed | `prefers-reduced-motion: reduce` |
|---|---|---|
| BessGlobe pins | transforms advance | frozen, byte-identical |
| Odometer reels | 2 of 8 move | 0 of 8 move |

Both gates work.

**The odometer check reported "no movement" in both states at first**, which
looked like a broken headline metric. The selector took `.odo-strip` — the
*first* reel — and the leading digit of a six-figure number legitimately never
turns. rAF was ticking at 60fps the whole time (290 ticks in 4.8s), which is
what said the instrument was wrong rather than the app. Sampling all eight
reels showed the cents moving exactly as designed.

**Then a longer run falsified a comment in the component.** It claimed the
accessible text "cannot drift from the reels, because it is updated from the
same loop, on the same frame". Measured over 24s:

```
t+3s    text €328,793.42   reels 328793.52   0.10 behind
t+9s    text €328,793.42   reels 328793.87   0.45 behind
t+21s   text €328,794.00   reels 328794.47   0.47 behind
```

Both are written from the same frame, but the text is only *rewritten* when the
whole unit changes, so between ticks it lags by up to one unit. The behaviour
is right — rewriting text 60 times a second to chase €0.05/sec would be far
worse — but the stated reason was not the real one. The comment now records the
invariant that actually holds: the text is accurate at the instant it is
written, never leads the reels, and never differs by a whole unit.

That comment also said "the audit harness therefore cannot observe this path at
all". True when written; not true any more. **A confident comment about what
cannot be tested ages badly the moment the tooling improves** — and this is the
second time this session that a comment asserting something untested turned out
to be the thing worth checking.

No behaviour was changed this pass. Two components were verified and two
comments corrected, which is the honest outcome when the code is already right.

### Block the API and watch: two pages loaded forever

Failure states are the least-designed part of most apps and nothing here had
ever exercised one. CDP's `Fetch` domain can fail or 500 any request, so the
question "what does a user actually see when the API is down" is answerable.

The answer differed by page, and the good one was already in the codebase:

| Route | API failing |
|---|---|
| `/spreadcast` | **"Market feed unavailable" + "Try again"** — correct |
| `/spreadcast/board` | **"Loading leaderboard" forever** |
| `/spreadcast/log` | **six shimmering skeleton rows, forever** |

`RoundContext` handles its own failures properly and `PlayView` renders off the
back of it. The two *view-local* fetches never got the same treatment — neither
had a `.catch()` at all, so a rejected promise left the state at `null`, which
those components read as "still loading". Sixth instance this session of a
pattern existing in the app and not reaching its siblings.

Skeleton rows are a promise that data is coming. When the request has already
died, that promise is a lie, and it never expires.

Both now distinguish the two meanings of `null`, render the same
unavailable-plus-retry treatment, and check `r.ok` **before** `.json()` — a 500
still returns a body, so the old code would have parsed an error response as
data. Verified against both `Fetch.failRequest` and a synthetic 500.

**Two things I got wrong while fixing it, both caught by testing rather than
review:**

1. **The first retry did nothing.** It re-set `scope` and `verifiedOnly` to the
   values they already held, expecting the effect to re-run. React bails out on
   identical state, so the button was decorative. Retries need their own
   dependency — an attempt counter.
2. **"Shows an error" is not the same as "recovers".** Asserting the failure
   text appears would have passed the broken retry. The test that matters runs
   the whole arc: fail the request → confirm the failure state → *stop* failing
   → click Try again → confirm real rows arrive. Both pages now pass it
   (leaderboard returns a real player, the log returns 10 settled rounds).

An error state you cannot leave is barely better than no error state, and
nothing about the markup tells you which one you have built.

### One badge, three renderings, and a letter that means nothing out loud

Finished the failure-state sweep first: `/` and `/dashboard-v2` both fetch
`/api/spreadcast/round` for the daily-game strip, and both degrade correctly —
`SpreadcastStrip` does `if (failed) return null`, verified present with the API
up and absent with it blocked. `/portfolio` and `/marketplace` fetch nothing.
So the earlier two fixes closed the last gaps.

Then, looking at the leaderboard for the first time, the verified marker:

| Location | Renders |
|---|---|
| `LeaderboardView` | `V` |
| `ArchiveView` | `V` |
| `PlayView` | `VERIFIED` |

Same class, same meaning, three renderings. PlayView spelling it out is the
useful detail — it proves nothing forces the abbreviation, so "V" is a density
choice for table rows rather than a constraint. That is defensible. What was
not defensible is that neither abbreviated badge carried an accessible name:
`<span class="sc-tag v">V</span>`, no title, no aria-label, no role, no
`sr-only` sibling. It announced as the letter "V" beside a player's name, and
the only thing that expands it is a footnote below the table.

Now `role="img"` + `aria-label="Verified"` — the treatment `Flag.tsx` already
uses, which tells assistive tech to read the meaning instead of the glyph. The
visible "V" is unchanged. Verified against the real accessibility tree, with the
attributes stripped as a canary:

| | role | accessible name |
|---|---|---|
| shipped | `image` | **Verified** |
| aria stripped | `none` | none |

**A single letter is a picture of a word.** It needs the same treatment an icon
does, and it is easy to miss precisely because it *is* text — a check looking
for unlabelled icons walks straight past it. Worth scanning for elsewhere: any
element whose entire content is one character is carrying meaning it cannot say.

### Consolidating the checks found the bug the checks had

Three sweeps came up clean this pass — icon-only controls (0 unnamed), the
single-character scan flagged last time (11 hits, all fine in context), and
long user-supplied names in the leaderboard (a 60-character unbroken word makes
the cell grow 198→506px at 1440 and wrap to two lines at 390; no page overflow,
`overflow-wrap: anywhere` absorbs it).

So the deliverable became `scripts/a11y-audit.mjs` — the contrast, structure,
focus and naming checks written across this session, which until now existed
only in a scratchpad. Writing them down as one tool immediately exposed four
faults in them:

1. **Text contrast was measured against the wrong background.** I reused
   `bgOf(el, skipSelf=true)` from the non-text check. A *border* sits against
   the parent's background; *text* sits on its own element's. That reported
   "Connect Wallet" at **1.00:1** — dark text measured against the dark page
   instead of the bright green button it is painted on. Twelve invented
   failures.
2. **box-shadow was not counted as a boundary**, so the check was blind to the
   app's own idiom. Both `.seg-btn.active` and `.sc-seg button.on` mark
   themselves with an inset accent underline; the audit called a state marked
   at 11:1 a 1.19:1 failure.
3. **Non-operable elements were in the control list.** Status badges state
   their status in words and `.chain-btn` is a non-interactive span. Twenty
   findings per run that nobody should act on — which is how an audit stops
   being read.
4. **A single-side border is not a boundary.** `.seg-btn`'s `border-left`
   separates it from the next segment; `.site-row`'s `border-bottom` is a row
   rule. Counting those asks the design to outline every list row. Borders now
   count only when they enclose (≥3 sides).

21 findings → 1. And the one that survived was real: **`.perf-toggle` drew its
border with `--border` (0.1 alpha, commented "brand ring value") instead of
`--border-control` (0.36), the token that exists precisely because controls
need 3:1.** Measured 1.24:1. The token has five uses in the stylesheet and this
control was not one of them — the seventh sibling-miss this session, and the
sharpest, because the codebase already contains the exact answer.

Also worth remembering: **a backtick inside a `String.raw` block ends the
template.** A comment reading `` `inset 0 -2px 0 var(--accent)` `` broke the
whole script with "Unexpected identifier". Injected page scripts cannot contain
backticks, and the failure looks nothing like its cause.

After: **0 findings** across 20 route/width runs — 1715 text nodes, 52 bounded
controls, 56 text-only exempt, 314 focusable elements. Canaried at
0 → 265/28/1 → 0.

### Four steps, and one group of users could not tell there were four

Walked the onboarding end to end for the first time — it is the first thing
every new visitor sees and only step 1 had ever been looked at. The flow itself
is well built: four steps, dots advancing 1→2→3→4, Back appearing from step 2,
a CTA that names the next topic rather than saying "Next" ("How it works" →
"What's Spreadcast?" → "Nearly done"), and a final step offering both
"Connect a wallet" and "Explore first".

The gap was progress. `.ob-dots` is `aria-hidden="true"` — correctly, they are
four decorative shapes and announcing them would be worse than silence — but
**nothing replaced what they say**. No role, no label, no text equivalent
anywhere in the sheet. A four-step flow where one group of users cannot tell it
is four steps, or which one they are on, gives them no way to judge whether
Skip is worth taking.

Now an `sr-only` "Step N of 4", placed beside the eyebrow and title rather than
next to the dots, so it is met on the way in instead of after the body.
Verified against the accessibility tree, and that it tracks the visual
indicator at every step:

```
dot 1/4 -> "Step 1 of 4"      dot 3/4 -> "Step 3 of 4"
dot 2/4 -> "Step 2 of 4"      dot 4/4 -> "Step 4 of 4"
```

with the sr-only removed as a canary, leaving only "WHAT THIS IS / SKIP".

**Two notes on driving a flow like this.** The walker first stalled at step 2
because it looked for a button matching "next|continue", and this design
deliberately never uses those words — matching *"the last control that is not
Skip or Back"* is what actually works, and is the more honest description of
"advance" anyway. And counting how many dots carry the active class said
`1 of 4` on every step, which looks like a stuck indicator; the question worth
asking is *which* dot is active, not how many are.

**aria-hidden is only half a decision.** It is right whenever a visual is
decorative, but decorative-looking things often carry the only copy of some
information. Hiding it correctly and replacing it are two separate steps, and
the second is easy to skip because the first one already feels like the fix.

### Hover-only content: one real, two false, and how to tell

A phone has no hover, so anything reachable only that way is missing for most
of the audience (WCAG 1.4.13). Swept for two shapes: `title` attributes
carrying something the visible text does not say, and CSS rules that reveal
content on `:hover` with no `:focus` counterpart.

**The real one.** The showcase badge on a vault page carried
`title="A live site we operate, published for transparency. Not open for
deposits."` — the *reason* the site is not investable, on a `<span>`. Reachable
by hovering a mouse and by nothing else: no touch, no keyboard, unreliably by
screen readers. That is the same objection `globals.css` already records
against `title` **twice**, in its own comments.

It was also redundant. Checking the rendered page before changing anything
showed Site overview already says it, at more length and better: *"Off-chain
showcase — one of our operational sites, published so the performance behind
Megawatt's numbers can be checked"*, plus *"Operated by Megawatt; deposits
happen in the on-chain vaults."* So the fix was to delete, not to add — a
tooltip repeating visible copy buys mouse users nothing and suggests to
everyone else that something is being withheld.

**The two false positives are the instructive part**, because both looked
exactly like the real one in the report:

- `.globe-pin:hover .globe-tip { opacity: 1 }` has no `:focus` twin — but
  `.globe-pin.selected .globe-tip` exists forty lines away. Tapping a pin opens
  its tooltip. A hover rule with no focus rule is not hover-only if a *class*
  provides the other path, and no selector-pair heuristic will see that.
- `.sc-hist span:hover { opacity: 1 }` is not a reveal at all. The base state is
  `opacity: 0.85` — visible. Matching on the declaration alone reads emphasis
  as disclosure; the question is what the value changes *from*.

So: grep finds candidates, the rendered page decides. Both false positives
needed reading the surrounding CSS, and the real one needed reading the page to
learn the fix was removal.

One JSX note. The comment explaining this was first written as `{/* … */}`
inside a ternary branch, which is a JSX *child expression* — two siblings where
a branch allows one, and the build fails with "Expected corresponding JSX
closing tag". A plain `/* … */` block is whitespace and goes anywhere, which is
why the comment already sitting there used that form.

### The pages the audits could not see, and the flag that hid them

Every sweep in this session ran against a fixed list of ten routes. The failure
pages were not on it — so the 404 and both error boundaries had never been
measured once, despite being pages users actually reach.

They turned out to be in good shape, which is worth stating rather than
assuming: `/no-such-page` returns a real 404 with title "Page not found —
Megawatt", an `h1`, copy naming a likely cause ("a specific vault… may have
been renamed or closed"), and two ways out. `error.tsx` has an `h1`, a `reset`
button and two escape links; `spreadcast/error.tsx` the same. Swept now: 0
responsive findings across four widths including landscape, 0 a11y findings,
tab order clean at both widths.

**The reason they were invisible is the durable part.** Pointing an audit at a
new route on this platform silently fails:

```
--routes "/no-such-page"
  -> C:/Program Files/Git/no-such-page
  -> {"code":-32000,"message":"Cannot navigate to invalid URL"}
```

Git Bash (MSYS) rewrites any argument beginning with `/` into a Windows path.
The error names the symptom and nothing else, and it is the same failure that
made an earlier `--routes` attempt look broken for no visible reason — that one
was written off as "some arg-parsing quirk" and moved past, which is exactly how
a tool ends up with a permanent blind spot.

Two fixes, both in `responsive-audit.mjs` and `a11y-audit.mjs`:

- the failure pages are now in the **default** route list, so they are covered
  whether or not anyone remembers them;
- a startup guard rejects any route not beginning with `/` and names the cause:
  *"On Git Bash, prefix the command with MSYS_NO_PATHCONV=1."*

An audit's blind spots are decided by its route list, and a route list is easy
to treat as scenery. The question worth asking of any harness is not "what did
it find" but "what can it not see" — here the answer was every page that only
appears when something has gone wrong.

### The title knew where it was; the page did not

Continuing "what can the harness not see": listing every `page.tsx` against the
audit route list showed one page route never measured —
`/spreadcast/result/[day]`. It swept clean. The interesting part was the route's
*failure* path, since a result URL is the one thing here built to be shared: it
has its own opengraph-image, so its dead links arrive from chat apps weeks
later, from people who have never seen the app.

Every malformed day already returned a correct 404 — `9999-99-99`,
`not-a-date`, `2026-08-01x`, and a `../../etc` traversal attempt. What did not
match was the page behind it:

| | |
|---|---|
| `<title>` | "Result not found · Spreadcast — Megawatt" |
| `<h1>` | "Page not found" |
| body | *"If you followed a link to a specific **vault**, it may have been renamed or closed"* |
| exits | Browse vaults · Play Spreadcast |

`generateMetadata` returns `{ title: "Result not found" }` when the round is
missing, so the route knew exactly what had happened — but `notFound()` had no
boundary nearer than the root, and the root 404 is written about vaults. A
stranger opening a shared result link got a correct tab title and an
explanation of something else entirely.

A nested `not-found.tsx` in the `[day]` segment now answers the question the
visitor actually has: "No round settled on that date… the link may point at a
date that has not settled yet, or one from before Spreadcast started", with
exits to the log and today's round. It inherits the Spreadcast layout, so the
section bar comes with it and the visitor stays where they were headed.

**Two things worth carrying:**

- **A correct `<title>` can hide an incorrect page.** The metadata and the body
  come from different places in the App Router, and only the metadata was
  route-aware. Anything that checks titles — the earlier pass that verified all
  14 links resolve with correct per-route titles — would have called this
  healthy.
- **404 copy is written for the person who arrives, not the developer who
  routes.** "Browse vaults" is a poor answer to "what was the spread on the day
  someone told me about". Both audits now carry both failure pages in their
  default routes.

### Every audit in this session measured the signed-out half of the app

The portfolio table, the vault position and claim cards, and the marketplace
sell picker are all gated on `connected` from `useWallet()`. Every sweep before
this one ran on a throwaway browser profile, so every one of them measured the
signed-out app and nothing else.

**The first attempt to reach it was wrong.** `POSITIONS` is `[]` in
`portfolio.ts`, so the obvious move was a temporary fixture — and it changed
nothing on screen, because the gate is `connected`, not the data. Worth knowing
before concluding anything from a fixture: check what actually gates the branch,
not what looks like it should.

The way in needed no code change at all. `wallet.tsx` is out of scope to modify,
but it *restores its session from localStorage on load* — `mw.xrplAddress` and
`mw.xrplVia`. Seeding those keys before navigation
(`Page.addScriptToEvaluateOnNewDocument`) reaches the signed-in state through
the app's own mechanism. Watch-only, using the XRPL black-hole account
`rrrrrrrrrrrrrrrrrrrrrhoLvTp` — public, inert, belongs to nobody, reads
balances and signs nothing. Never the real user's address.

Both audits now take `--as-connected`, and it found something on its first run:
**`button.wallet-pill` at 1.40:1**. That is the header control that opens the
wallet modal — operable, and only rendered while connected, so no sweep had
ever seen it. Same root cause as `.perf-toggle` two passes ago: a decorative
border rung (`--border-2`, 0.14 alpha) on an operable control, where
`--border-control` (0.36) exists for exactly this. Two of the three elements
wearing that class are operable; the third is a static badge and is unharmed by
a stronger border.

Signed-in sweeps after the fix: 24 a11y runs and 48 responsive runs, 0 findings,
in both the fixtured and the real-data condition.

**On the fixture discipline.** The rule written down earlier — never put a
temporary fixture in a file with uncommitted work — held. Tree confirmed clean
before, `git checkout --` on that one path after, `git status` showing only the
three intended changes, and `.next` grepped for the fixture's contents to make
sure the build carried none of it forward.

### The last unaudited primitive, and a test that lied about focus

`--as-connected` immediately paid for itself twice. The first was the wallet
pill. The second is that `Sheet` — recorded two passes ago as "the one overlay
primitive still unaudited, because both of its users need session state" — is
reachable through `WalletModal` once a session exists.

Measured, it is correct on every count: `role="dialog"`, `aria-modal="true"`,
`aria-labelledby`, a close button, initial focus inside, focus trap, body scroll
lock, Escape, scrim dismiss, focus restored on close. Geometry too — 560×280 in
a 658×320 landscape viewport, because `max-height: min(88svh, calc(100svh -
40px))` caps it. The `.modal` primitive was 487px tall in that same viewport and
needed rescuing. The earlier note that `Sheet` was "structurally safe by
construction" was right, and is now evidence rather than inference.

**The test claimed one failure, and the test was wrong.** `focusRestoredToClose`
came back false — on code whose whole purpose is focus restore. The cause was in
the harness: it opened the dialog with a programmatic `el.click()`, and **a
programmatic click does not move focus**. So `useDialog` captured
`document.body` as its restore target and dutifully restored to it. Focusing the
trigger first, the way a real click or an Enter press does, restores to the
wallet pill exactly as written.

The general shape: when simulating an interaction, ask what *else* the real
gesture does. A click focuses. A tap does not hover. A keyboard activation both
focuses and fires. Simulating only the payload and not the side effects produces
failures in whichever code depends on the side effect — and those failures are
convincing, because they land on exactly the feature you were testing.

This also gives `docs/wallet-tsx-handoff.md` a measured side-by-side: ten dialog
behaviours, `Sheet` has all ten, `XrplConnectModal` has one (scrim dismiss, its
only exit). That is the whole argument for the change in that file, on evidence.

### A reference to something that is not there yet

The archive rows on `/spreadcast/log` expand to a price curve and the revealed
predictions — real interactive UI that no audit had rendered, because every
sweep measures pages as they load. Expanding one is clean: 10 rows become 13,
the detail appears, nine charts draw, no overflow at 390 or 1280.

The disclosure semantics were already right — a real `<button>` inside the cell
carrying `aria-expanded`, added by an earlier pass with a comment explaining
that a `<tr onClick>` "advertised a disclosure only a mouse could open". State
tracks correctly: false → true → false.

One thing did not. `aria-controls` was set unconditionally, but the detail row
is rendered **lazily** — its content is fetched on first open — so while
collapsed the attribute pointed at an id that is not in the document. A
dangling `aria-controls` is worse than none: it promises the accessibility tree
a relationship it cannot follow, and `aria-expanded` is what actually carries
the state. `aria-controls` is optional in the disclosure pattern, so it is now
present exactly when its target is: absent closed, present and resolving open.

Fixing it *properly* would have meant rendering all ten detail panels up front
so the ids always exist — trading a lazy fetch for eager work on every row, to
satisfy a validity nit. Removing the attribute when it cannot be true is the
cheaper truth.

**Two harness mistakes, both about reading state at the wrong moment:**

- The probe captured `aria-controls` **once, before opening**, then called
  `getElementById` on that stale value for all three samples — so it reported
  "does not resolve" in every state including the one where it does. Attributes
  that change have to be re-read on each observation, not closed over.
- The first sample found the `<tr>` rather than the `<button>` and concluded
  there was no `aria-expanded` anywhere. The row *and* the button are both
  clickable by design; a selector that takes the first match takes the wrong one.

**And a JSX rule, hit twice this session:** `{/* … */}` is a *child expression*.
It cannot go between attributes (`'...' expected`) and it cannot be one of two
siblings in a ternary branch (`Expected corresponding JSX closing tag`). In both
places the fix is the same — put it in children position, or use a plain
`/* … */` block, which is whitespace and goes anywhere.

### Laid out is not the same as seen

Every audit measured each page in the state it loads in and no other. Tabs,
range selectors and filters all re-render layout, so most of what the app can
draw had never been looked at. `scripts/state-audit.mjs` clicks through every
option of every mutually-exclusive group and re-runs the geometry checks after
each: **80 states across seven routes and four widths, 0 problems.** Canaried
by injecting an overflow *after* each state change — 8 of 9 states report it
while the default state stays clean, which is exactly the blind spot it closes.

**The first run found three overflows that were not real, and the cause was in
every audit written this session.** `visible()` has always been
`getClientRects().length > 0` — which is true of anything with geometry,
including elements at `opacity: 0`. This app keeps six of those permanently in
the DOM: the globe tooltips, which fade in on hover or selection. They are
positioned against a *rotating* globe, so they drift in and out of overflowing
the viewport.

That is worse than a false positive; it is an intermittent one. `responsive-audit`
has reported clean all session partly because the pins happened to sit
favourably each time. Both committed audits now use `painted()` — client rects,
plus no ancestor at `opacity: 0` or `visibility: hidden`, since opacity is
inherited visually.

Applied to geometry and contrast only, deliberately. `opacity: 0` text is still
in the accessibility tree, so its *name* and *structure* still matter; what
cannot matter is the contrast of something invisible or whether an unseen box
overhangs the viewport.

**Two process notes.** The first attempt built the state mode by string-surgery
on `responsive-audit`'s check source, injecting a loop that called a function
that source does not have. The assert caught it before anything was written; a
mode assembled by rewriting another mode's text would have been worse than no
mode. And the backtick rule bit for the second time — the check body contained
`` `${sel} → ${name}` ``, which ends the `String.raw` block it is embedded in
and fails with `Unexpected identifier '$'`, pointing nowhere near the cause.
Concatenation, not interpolation, inside anything injected.

The MSYS guard added last pass also caught a mistake of mine on its first
outing, which is the nicest thing that can happen to a guard.

### A page called "Vaults" where you scroll a screen to reach one

Looked at the homepage for the first time. On a phone the four stat tiles
stacked one per row: 497px of metrics, putting the first vault card at
**y=977** on an 844px screen. A page titled "Vaults", whose subtitle is about
investing in them, and you scroll a full viewport before seeing one.

The grid already used two columns between 481 and 640px. The single-column rule
below 480 was the odd one out and carried no note saying why — unusual in this
stylesheet, where nearly every rule states its reason. Measured before → after:

```
320px   grid 517→401   first card 1060→944   (−116px)
360px   grid 497→332   first card  977→811   (−166px)
390px   grid 497→299   first card  977→778   (−199px)
430px   grid 497→263   first card  977→743   (−234px)
```

Two rows beat four even though each tile grows taller, and at 390 and up the
first vault clears the fold.

**Then the change broke something, and only a second measurement found it.**
`.tile-icon` is absolutely positioned, so it takes no space in flow and the
label's line box runs underneath it. At four-across that never mattered — wide
tiles, short labels. Narrowed to two columns, the labels wrapped into the icon's
band and the *glyphs* collided at 320, 360, 390 and 430.

Catching it needed the right measurement twice over. The first attempt compared
the label element's box to the icon's and reported a uniform "34px overlap"
everywhere — the box always overlaps, because the icon is out of flow. What
matters is where the **text** ends, which needs a `Range` over the text node:
`selectNodeContents` then `getClientRects()` gives the glyph bounds. Only then
does 320 differ from 480.

The reserve is arithmetic, not a guess: the icon is `right: 16px` and 34px wide,
so it owns the last 50px of the tile, while the label's content box stops at the
20px padding — exactly the 30px measured. `padding-right: 38px` clears it with a
small gap, on the label alone, since the value and sub-line sit below the icon.

**The lesson is about the shape of a layout change.** Making something narrower
does not just re-flow it; it moves content into bands that were empty at the old
width, and absolute positioning is invisible to every check that looks for
overflow or clipping — nothing overflows and nothing is clipped when two things
simply occupy the same place. The screenshot showed it before any check did.

Also fixed while here: the a11y audit reported `.sc-band-card` at "1.00:1 via
fill". Five bands sit side by side on the same `--card` as their container,
separated by a `border-right` — a rule between options, like `.seg-btn` and
`.site-row`. 1.00:1 is not a faint boundary; it means the colours are identical
and there is no fill distinction to measure. A fill matching its surround is now
treated as no boundary, the same as having none.

### Text under an overlay: the check the other three could not have

Last pass found a glyph collision by eye and noted that nothing automated
catches it — an out-of-flow element takes no space, so nothing overflows and
nothing clips when it lands on a label. That check now exists, inside
`responsive-audit.mjs`. It found a second collision immediately: at **430px**
the "Total Capacity" value `16.1 MW` sat under its own tile icon. 390 was clear
only by luck — the label wrapped to two lines there and pushed the value down.
A `min-height` on the label makes that accidental clearance deliberate.

**Getting it to work took four corrections, each of which made it silently
useless or uselessly loud:**

1. **Paint order is not document order.** A positioned element paints above
   in-flow content whatever the source order, and `StatTile` emits its icon
   *before* the label. A document-order test reported **nothing** on the very
   collision the check was written for — it passed clean and I nearly believed
   it.
2. **z-index lives on the stacking context, not the leaf.** Comparing the two
   elements' own `z-index` concluded a tile icon painted over the phone tab
   bar's labels, when `.bottom-nav` carries `z-index: 60`. Three confident
   findings in landscape about text nobody covers. Effective z — the highest
   z-index on the element or any ancestor — is the honest comparison.
3. **A full-screen scrim is not a collision.** Without excluding overlays that
   span the viewport, the first run reported 90 hits, every one of them the
   onboarding scrim doing exactly its job.
4. **A fixed bar is not either.** Page content scrolling beneath the tab bar is
   what the bar is for; measured at one scroll offset that reads as 55 more.
   The check is about decoration positioned against a *component*.

The scratchpad sweeper also turned out never to have received the
`?onboarding=0` fix the committed scripts got weeks of passes ago — which is
how correction 3 arose. Tooling that lives outside the repo does not inherit
the repo's lessons.

**And the canary mattered more here than anywhere.** The check reported "clean"
across 30 runs while being incapable of detecting anything at all. Only
reverting the known fix and confirming it fired — 0 → 2 → 0, naming the exact
elements — showed the difference between a passing check and a working one.
Both the standalone and the folded-in version were canaried separately, because
transcribing a check is a chance to break it.

### The same quantity, written two ways, 200px apart

Reviewed two pages never looked at before. `/spreadcast/how` is sound — and its
timeline already carries the fix it needs: the column runs 15:00 · 11:45 ·
~13:00 · 15:00, which reads as predictions closing six hours before they open,
and an earlier pass added "the following day" to row two to carry the day
boundary. Only one boundary exists (rows 2-4 are all the close day), so it is
handled. Checked rather than re-fixed.

The vault page's lower half had a smaller thing. Two prices per megawatt-hour
sit three rows apart on one card:

```
YESTERDAY'S SPREAD  196.76 €/MWh
Current price       €138.30/MWh
```

The app writes this unit as a suffix in about fifteen places — the Spreadcast
bands, the results table, the daily-spread line directly above it. Only this row
prefixes the symbol, because it reached for `fmtMoney`, which is right for a sum
of money and wrong for a rate. `€138.30/MWh` is not incorrect in isolation; it is
just not what the rest of the app says, and it is adjacent to the version that
is.

**On reviewing pages you have never seen:** the how-page cost nothing and found
nothing, and that is still worth the pass. Its timeline *looked* wrong until the
source explained it had already been argued about — which is the same amount of
information as finding a bug, arriving cheaper.

### 0.3 MW is not how you write 350 kW

Last pass's €/MWh finding suggested a systematic version: which surfaces bypass
the shared formatters? Most of the hits were nothing — eleven `toFixed(1)}%`
call sites look like bypasses of `fmtPct`, but `fmtPct` **is**
`` `${n.toFixed(d)}%` ``, so they are identical and rewriting them would be pure
churn. The helpers worth checking are the ones with real logic.

`fmtPower` has some: it picks kW or MW by magnitude and drops the decimal on
whole numbers. `NetworkPanel` did not use it — its rows are already in MW, so it
wrote `capacityMw.toFixed(1)`. Same six sites, two surfaces:

| | network panel | vault card |
|---|---|---|
| Belgrade | 5.0 MW | 5 MW |
| Leipzig | 3.0 MW | 3 MW |
| **Ljubljana** | **0.3 MW** | **350 kW** |

The trailing `.0` is cosmetic. Ljubljana is not: **0.3 MW reads as 300 kW**, and
the site is 350. A forced unit rounded away 14% of a headline capacity on the
protocol dashboard. `fmtPower(capacityMw * 1000)` restores it and makes the
whole-number rows agree too — all six now match their cards exactly.

The same component was also printing `status.replace("_", " ")` — the raw enum,
which is precisely what `BessGlobe` was doing before `statusLabel()` existed.
`NetworkPanel` was the sibling that never got that fix. Eighth instance this
session, and the pattern is stable enough to state plainly: **when a helper is
introduced to fix one call site, the call sites that did not change are the
thing to go looking at**, because they are invisible in the diff that introduced
it.

**A note on what not to fix.** The eleven percent call sites are exactly
equivalent to the helper. Changing them would produce a large diff, no
behavioural difference, and a reviewer's afternoon. A consistency sweep is only
worth running where inconsistency can *diverge* — which is the same reason
`fmtPct` bypasses are noise and `fmtPower` bypasses were a rounding error.

### Auditing my own fixes: three helpers, three sites that never got them

The "call sites that did not change are invisible in the diff" lesson has fired
eight times, so this pass applied it deliberately: for every helper introduced
during this session, grep for surfaces still doing it the old way.

Three hits, all of them *my own* incomplete fixes:

- **`apyBpsIsGross`** — the globe tooltip still keyed on `kind === "showcase"`,
  the exact assumption ground truth disproved. BESS Leipzig 01 read
  "12.4% APY" there while its card said "12.4% Gross yield". The marker even
  carried a `kind` field I had added *for this decision*, before learning the
  decision was data-derived; it now carries `apyIsGross` instead.
- **`fmtPower` / `fmtEnergy`** — the globe tooltip printed raw MW, so Ljubljana
  read "0.35 MW / 0.55 MWh" against its card's "350 kW / 550 kWh". The same
  defect fixed in `NetworkPanel` one pass earlier, on the surface next to it.
- **`vault.currency`** — `Vault remaining` in the deposit modal used `"USD"`,
  but `remaining` is `capex - raised`: both asset-side, both EUR, and the tile
  at the top of that same page calls it "Target raise €3.20M". Missed by the
  original currency sweep because it only renders with a wallet connected, and
  that sweep predates `--as-connected`.

**Two things worth carrying.**

A grep for the *old* pattern is not the same as a grep for the *helper*. Looking
for `status.replace` found nothing but my own comments; looking for
`kind === "showcase"` found the live bug — because the old pattern had been
edited away in most places while the wrong *key* survived. Search for what the
call sites still do, not for the string the fix removed.

And a data model can hide a unit error. `others = raised - deposited` subtracts
an EUR figure from an RLUSD one. It is inert today because every on-chain vault
has `raised: 0`, so it evaluates to zero and shows nothing wrong — which is
exactly why it would ship. Flagged, not fixed: reconciling those two is a data
decision, not a formatting one.

### A lint for the mistakes this codebase actually makes

Nine instances of the same shape — a helper introduced, and the call sites that
did not change staying invisible in the diff — is enough to stop relying on
remembering. `scripts/consistency-lint.mjs` encodes the six rules this session
paid for, as static greps over source. No browser, no server, runs in a second.

| rule | what it caught originally |
|---|---|
| `raw-status-enum` | one status spelled three ways |
| `kind-decides-yield-label` | a gross yield labelled "APY" |
| `asset-figure-as-USD` | €2.44M summed and printed as $2.44M |
| `raw-megawatt-field` | 350 kW shown as 0.3 MW |
| `currency-prefixed-rate` | €138.30/MWh beside 196.76 €/MWh |
| `usdc-in-copy` | "Settled in USDC" on an RLUSD protocol |

**On its first run it caught an incomplete fix of mine from this same
session.** `Vault remaining` had two call sites; a scripted edit landed on one
and silently missed the other, so line 837 said €3.20M while line 743 still
said "$3,200,000 of room left". Both were in a diff I had reviewed. The lint
found it in a second.

**It also produced two false positives immediately, which is the more useful
half.** `listedFaceValue` looked asset-side and is not — marketplace face value
is `shares × 1.00` of an RLUSD-pegged token, so USD is right there. And
`VaultDetail` labels `split.depositorBps` as "Net yield" or "Depositor APY",
which *is* correctly keyed on `kind`: a showcase site has no depositors. Both
rules were narrowed the same day they were written. **A lint that flags correct
code gets switched off**, so the cost of a loose rule is not noise, it is the
whole tool.

Three other things worth keeping:

- **Strip comments before matching.** The first `status.replace` grep returned
  only the comments explaining its removal. A rule that matches its own
  documentation reports the fix as the defect.
- **Canary every rule against a synthetic violation.** A regex typo produces a
  lint that passes everything, and passing is indistinguishable from clean.
  `--canary` asserts all six fire.
- **Only lint what can diverge.** Eleven `toFixed(1)}%` call sites are exactly
  `fmtPct`, so there is no rule for them. `fmtPower` bypasses got one, because
  the output actually differs.

### A two-character word alone on its own line

Went looking for heading runts at mobile — a wrapped title leaving one short
word stranded. The detector was wrong twice before it was right, in the same way
both times.

**Counting Range rect tops as lines fails on flex rows.** "Active vaults 2"
reported four lines at 390px. It is one row: a 7px dot, a text run and a taller
count badge, each with its own vertical extent, so three distinct rect tops for
one visual line. Switching to box-height ÷ line-height failed the same way,
because a flex row with a taller child is also taller than one line. Only
restricting to LEAF elements — no element children — measures text rather than
container geometry. (The shipped `line-too-long` check already does this, which
is why it was never affected.)

The real finding, once the instrument was honest: **`.vault-name` stranded "01"
on its own line.** Every vault is "<City> 01", so the string always ends in a
two-character token — the ideal candidate for stranding. At 320px "BESS
Ljubljana 01" broke over three lines with "01" alone at 21% of the width; at
360px, two lines with it at 14%. Six cards, first screen.

`text-wrap: balance` fixed 360 and 390 and did nothing at 320, because the name
box was only 80px — about ten characters. Balance cannot balance a box that
narrow. The card top is 246px there and the nowrap status badge takes 95 of it,
the thumb 46, gaps 25.

Two more corrections getting the badge onto its own row:

- **`flex-wrap: wrap` alone did nothing.** The name group is `flex: 1`, so its
  basis is 0 and it shrinks to make room instead of pushing anything down. The
  computed style said `wrap` and the layout was unchanged, which is a confusing
  pair to look at.
- **`flex-basis: 100%` on the badge broke the line and also stretched it**, so
  the pill became a full-width banner around left-aligned text and stopped
  reading as a chip. The break and the width are separate problems: a zero-height
  `::after` with `flex-basis: 100%` claims the rest of the first row, and the
  badge starts a new one at its natural 95px.

All six names are now single-line at 320, 360 and 390.

### A dead link previewed as a settled result

Restating the last three rules as invariants was mostly a quiet exercise, and
the honest result is worth writing down as much as the defect that followed.

`currency-prefixed-rate` holds: every `€/MWh` in the app is a suffix, which is
the correct idiom, and the symbol-prefixed shape appears nowhere.

`raw-megawatt-field` had a genuine gap — it listed only the MW fields, which is
the shape of the NetworkPanel defect rather than the rule — so `powerKw` and
`energyKwh` joined it. But `chargedMwh`/`dischargedMwh`, printed as "MWh" in
four places, are deliberately left out. **Checked rather than assumed**:
`fmtEnergy` has no GWh tier, so routing them through it returns the same string
with one decimal fewer, and cumulative YTD throughput never falls under 1 MWh.
Changing those would have been churn dressed as consistency.

Then the OG share card, which no audit covers because it is a raster.

For a day with no result it rendered **"SETTLED RESULT · SI DAY-AHEAD ·
2099-01-01"** with the middle band lit at full opacity. Two claims, both false:
a settlement, and a determined band outcome. `band = 2` exists so the colour
lookup has something to index; it was reaching the rule and becoming an
assertion. **A default that exists to keep a lookup safe must not become a
claim.**

The sharpest part is where it lands. The page itself calls `notFound()` for such
a day — but the image route returns 200. So a dead or mistyped link 404s for
anyone who clicks it and previews as a settled result for everyone who merely
sees it pasted in a chat. The preview is the only part most people ever
encounter, and it was the part making the claim.

Both branches verified by generating the actual PNGs: the real day still reads
196.76 €/MWh with the Swingy band lit in amber, the unknown day now reads
"SI DAY-AHEAD · FREE DAILY GAME" with all five bands uniformly dimmed.

Worth noting the coverage gap this sits in: everything else here is measured in
a DOM, and this artifact has none. It was found by rendering it and looking.

### Auditing the rules the way I audit the app

Last pass found a lint rule that matched the mistake I had made rather than the
invariant it was meant to protect. So this pass asked the same question of every
other rule — and the first one answered badly.

`raw-status-enum` matched `.status.replace(`. That is one way to leak an enum to
screen. The invariant is that **a value stored as an enum or an index never
reaches the screen unmapped**, and stating it that way immediately found a
breach the old rule could not see: the reveal table rendered `{p.band}`, a bare
0-4, under a column headed BAND. Measured: "2 ✓".

Every other surface names bands — the archive row above that very table reads
"SWINGY · 176 – 244", the play view's cards are Calm through Wild, the shared
result page says "Swingy". The one place showing a raw index was the reveal
table, whose entire purpose is letting a stranger check somebody's pick against
the outcome. A number they have to decode defeats the point of the table.

Widening the rule then found a second breach and one false positive, both
instructive:

- **`label={snap.mode}`** on the vault hero tile rendered the raw MarketMode,
  while the State of charge card 370 lines below formatted the same field as
  "↑ Charging" / "Idle" / "↓ Discharging". One value, one page, two spellings —
  and the arrow that says which way energy is flowing appeared on only one of
  them. Both now go through one `modeLabel()`, and the tile gained the arrow,
  which is the most useful thing about that field.
- **`` `http ${res.status} from ${url}` ``** is an HTTP status code in an error
  message, not an enum on screen. The rule needed `(?<!\$)` to exclude template
  literals. A rule that flags correct code gets switched off — the note at the
  top of that file, earned again.

`outcomeName` stays deliberately unmatched: it arrives as "Swingy", already a
display string, so rendering it raw is right.

The pattern across both passes: **write the rule from the invariant, then check
what it catches — not from the diff you just made.** Both times, stating the
invariant found a live defect within minutes.

### The lint rule caught the mistake I made, not the one I missed

Read the shareable result page — `/spreadcast/result/<day>` with a real day
rather than the 404 variant. It is the only route in the app designed to be
arrived at with no context, so it is the page strangers see.

Most of it is carefully built. The weekday is computed rather than asserted
(2026-08-02 genuinely is a Sunday), the date is pinned to UTC with a comment
explaining that a delivery date must not shift by timezone, the `<h1>` is
screen-reader-only because the visible figure is the headline, and the
provenance block exists precisely because the page gets cited as evidence.

But the Source row rendered `{round.source}` raw: **"energy-charts"**. Two
passes ago I moved the other two call sites to `sourceLabel()` after finding
SIMULATED stamped on real market data. This was the third, and it meant one
field had three presentations across three surfaces — "energy-charts" here,
"ENERGY-CHARTS" in the log, "ENTSO-E via Energy-Charts" in the play view — with
the inconsistent one on the page most likely to be seen by someone who has never
used the app.

**The lint rule I added with that fix did not catch it.** The rule matched
`source === "entsoe"` — the ternary, which was the shape of the mistake I had
just made. A raw `{x.source}` render is a different shape and went straight
through. It was found by reading the page.

That is the general lesson and it is uncomfortable: **a rule written from a
fix encodes the defect you saw, not the defect class.** When the fix was
"route every render through a helper", the rule should have been "no raw render
of this field" — the invariant — rather than "not this particular wrong
expression". The rule now matches both shapes, verified firing on the ternary
and the raw render while staying silent on `sourceLabel(round.source)` and on
`source: round.source` in the loader, which is data plumbing and not a render.

### The audit scripts filled the disk

Every audit here starts Chrome with a throwaway profile via `mkdtempSync` and
kills it in a `finally`. None of the five ever deleted the directory. Across a
session of measurement that reached **714 abandoned profiles at ~14MB each —
9.8GB** — and then the disk was full and nothing on the machine could open a
file for writing.

The failure mode is worth recording because of where it lands. Every tool
available for diagnosing it needs to write a file first, so Bash, PowerShell,
Write and Edit all failed with ENOSPC before running a single byte of what they
were asked to do. Only read-only tools still worked, which was enough to confirm
the uncommitted work was intact and to read the scripts — and reading them is
how the fix was found. **An outage that disables your own tooling is the case
for having read-only paths that still function.**

Two corrections on the way out, both from measuring rather than assuming:

**The prefix I first told the user to delete was wrong.** I said `overlay-*`;
the script actually uses `ov-`. Grepping the sources rather than trusting memory
turned up the real set — `cdp-`, `resp-audit-`, `ov-`, `state-`, `a11y-` — and
`cdp-` was the bulk of it, since that driver runs behind nearly every probe.

**Deleting at exit does not work, and retries do not save it.** `chrome.kill()`
takes down the parent, but the renderer and GPU children keep handles on the
profile, so `rmSync` gets EPERM — even with `maxRetries: 20`. The first version
of the fix therefore crashed a run whose audit had already completed cleanly,
which is strictly worse than the leak.

So the fix is in three parts: a **best-effort** removal at exit, wrapped in a
catch that warns instead of throwing, because failing to tidy up must never fail
a sweep; and a **sweep at startup** that removes same-prefix directories older
than ten minutes, which are guaranteed released by then. The next run cleans up
after the last one. Ten minutes rather than "everything else" because concurrent
audits are normal here and deleting a live sibling's profile would break it.

Measured after: one stale directory swept on the next run, six profiles total
across the entire suite instead of unbounded growth.

The tell was available all along and I never looked: `chrome.kill()` sitting
alone in a `finally` block in five files, with `mkdtempSync` at the top of each.

### ch is a digit width, not a character

Encoded last pass's finding as a check: characters per line, from Range line
boxes, on multi-line prose. It found two more immediately — the leaderboard's
legend at 106 cpl over 3 lines from 768px up, and the how page's band paragraph
at 98 at tablet widths. Both real, both invisible to every other rule here
because each asks whether a box fits and both paragraphs fit perfectly.

Then the fix did not work, and the reason is worth keeping.

I capped both at `max-width: 75ch` and the check kept firing at 98. The class
was applied and binding — computed `max-width: 662px`, parent 712 — so 662px was
fitting 98 characters. **`ch` is the advance width of the digit "0"**, which in a
proportional face is noticeably wider than the average lowercase letter. Here the
ratio is about 1.3: 75ch measured out at 98 real characters. To get 75 characters
you want roughly 58ch.

So a rule written as "75ch for a 75-character measure" is off by a quarter, in
the permissive direction, and reads as if it were precise. The `.sc-notice` cap
from last pass has the same bias — 68ch measures 84 — which is inside the ceiling
but closer to it than the number implies. Both now carry the measured figure in
the comment rather than the nominal one.

The general lesson: **a unit named after a character is not a character count.**
`ch`, `ex` and `em` are all font-metric units, and if the thing being controlled
is legibility rather than layout, the only way to know the cap worked is to
measure the rendered result. Which is exactly why the check earns its place —
it caught its own fix being wrong.

Three conditions on the check, each one earned rather than assumed:
multi-line only (a single-line strip has no return sweep, so `.sc-legal` at 102
is fine and stays), 120+ characters (a long label is not prose), and
proportional type only (mono blocks here are hashes, where the character count
IS the content). Trip point 95 rather than 90, because a rule that fires at 91
produces argument instead of fixes.

Canary covers it — silent, fires on a forced two-line 1400px paragraph, silent
again. Two lines deliberately: a one-line canary would pass the multi-line
exemption and prove nothing.

### 140 characters per line, at every desktop width

The sweep stopped at 1440 and 1920 is the most common desktop resolution, so I
checked 1600, 1920 and 2560. Geometry came back clean at all three — but "no
overflow" is not "reads well", and the interesting measurement at those widths
is characters per line, not boxes.

`main` is capped at `max-width: 1120px`, which is why 1440, 1920 and 2560 render
identically. The container was already doing its job. What it does not do is cap
the *measure* inside it: the Spreadcast fine print ran **140 characters per
line**. Comfortable is 45-75 and ~90 is the practical ceiling; past that the eye
loses its place on the return sweep. A poor thing to do to the one paragraph
that is legally load-bearing.

Note what this was NOT: a wide-viewport bug. It was identical at 1440. I went
looking at 2560 and found something that had been wrong at every desktop width
since the page was written — the unusual viewport was the pretext, not the
cause.

The fix wrote down a number the codebase had already chosen twice: ArchiveView
sets `maxWidth: 440` and LeaderboardView `420` inline on their empty-state copy.
At this font size 68ch is ~442px, so `.sc-notice { max-width: 68ch }`
generalises the existing decision to all ten call sites instead of inventing a
value. The two inline caps are narrower and still win — verified by forcing the
archive fetch to 500 and measuring the error notice at exactly 440px, rather
than trusting specificity.

Fine print now measures 84 cpl.

`.sc-legal` still reads 102 and is deliberately left alone. It is a single-line
footer strip of `·`-delimited tokens, not a paragraph — there is no return sweep
to lose your place on, and capping it would force a two-line wrap for no gain.
**The measure rule applies to multi-line prose; applying it to everything over
90 would be following the metric rather than the reason for it.**

1920 joins the default sweep; 2560 deliberately does not, because it is provably
identical output for double the runtime.

### Two halves of one tile, keyed on different things

Swept for the failure mode from last pass — a number whose caption is computed
separately — by finding JSX elements carrying both a value-ish and a label-ish
prop where at least one holds a conditional. Five candidates. Four key both
sides on the *same* predicate and are fine. One did not.

The yield tile keyed its **label** on `isGrossHeadline` (i.e. `apyBpsIsGross()`,
a property of the data) and its **sub** on `isShowcase` (a property of the
wrapper). Measured across all six vaults:

    Ljubljana  GROSS YIELD  12.2%  "On capex / yr"
    Leipzig    GROSS YIELD  12.4%  "Per annum"
    Vilnius    GROSS YIELD  13.1%  "Per annum"
    Bucharest  GROSS YIELD  12.8%  "Per annum"
    Belgrade   APY          13.0%  "Per annum"

Three tiles reading GROSS YIELD while disagreeing with the other two about what
the number is a yield **on**. The sub carries the denominator, and "on capex per
year" is exactly what makes a figure gross rather than a depositor APY — so the
vaults that most needed the qualifier were the ones missing it.

This is the same fix, half-applied. The label had already been moved off `kind`
onto the data when the kind-based guess was found wrong for Leipzig; the sub was
left behind. Fourteenth sibling-miss, and the first where the earlier fix's own
commit message describes the exact vault that still had the bug in the other
half of the same element.

Worth generalising: **when a fix changes which predicate something is keyed on,
the unit of work is every expression keyed on the old predicate in that element**
— not the line that was reported. The label was reported; the sub sat three
lines below it and looked untouched because it was.

Also, the JSX comment trap for the third time: I put `{/* … */}` between two
attributes of `<Tile>` and got `TS1005: '...' expected` at a column that points
at the attribute, not the comment. Comments are child expressions. They go above
the element or inside its children, never in the attribute list.

### Four cards said TVL over money nobody had put in

Went looking for somewhere to apply compiler-enforced exhaustiveness and found a
real defect on the way, which is the better outcome. The existing
`Record<VaultStatus, …>` maps are already exhaustive by type; the gap was the
ternary chains, and one of them had a hole.

VaultCard picked its third metric with two separate ternaries — one for the
value, one for the label — and `coming_soon` fell into the else-branch of both.
So every pipeline card rendered

    €3.20M
    TVL

directly above **"Opens for fundraising next quarter"**. Nothing is locked in a
site that has not started raising: the figure is `capex`, the target. The card
contradicted itself, on four of the six tiles on the landing page, under a
headline financial term.

VaultDetail already handled it, calling the same number "Target raise" for
`coming_soon`. Thirteenth sibling-miss.

The fix that matters is not the label. **The value and the label were two
ternaries three lines apart that had to agree**, which is precisely the shape
that has drifted here over and over: someone extends one branch, the other keeps
its old answer, and the diff looks complete because both lines are visible and
both look deliberate. They are now one function returning both.

And a note on the thing I set out to do. I planned a `switch` with a `never`
default and did not write one, because the choice here is two-dimensional:
`status` decides raising-versus-running, `kind` decides whether a running site
quotes revenue or TVL. An exhaustive switch on `status` alone would have been
exhaustive over the wrong axis — rigorous-looking and still wrong. Compound
conditions are the honest shape, and they match protocol.ts.

**Exhaustiveness is only a guarantee when the union you switch on is the union
that actually determines the answer.**

### The rule I tried to write and then deleted

Three of the last four defects were a ternary asserting a field is boolean when
it is not, so I swept every user-facing ternary in the app against its field's
real value space. **No new defects.** `via`, `kind`, `Currency`, the chart's
`mode` and the leaderboard's `scope` are all genuinely binary; the plural
ternaries are correct English (verified on a live boundary — the board reads
"1 player, this week" and "9 players, this season"); the multi-value ones are
already handled by chains or compound conditions.

Getting there took two instrument corrections, both worth recording because
both would have hidden a real defect rather than invented one:

**The first regex misread compound conditions.** Matching
`field === "lit" ?` captured only the LAST comparison in a `||` chain, so
`v.status === "active" || v.status === "operational" ? "deployed" : "pipeline"`
— correct code — was reported as a single-value test. The failure mode is the
dangerous direction: a properly-guarded multi-value field looks like a naive
binary, so a sweep built on it would flag good code and, worse, teach me to
distrust its output.

**Then the lint rule I wrote to encode the pattern was not viable.** First
version matched the bare name `mode` and produced 14 hits in SiteChart, whose
`mode` is a local `"power" | "energy"` view toggle — same name, unrelated type.
Narrowing to dot-qualified access dropped it to 6, and all 6 were still false:
four are legitimate ternary CHAINS where the chain continues in the else-branch
or spans lines, and two are compound conditions where my `||` guard looked after
the `?` while the `||` sat before it.

Handling chains, multi-line expressions and compound conditions correctly is
parsing, not pattern matching. So I deleted the rule and left the file exactly
as it was. **A lint that fires six times on correct code is worse than no lint**
— the other nine rules are trustworthy precisely because they sit at zero, and
one noisy rule would teach everyone to skim past all of them. That is the note
already written at the top of that file about listedFaceValue, and it applied to
my own work this time.

The real answer for this defect class is not a regex at all: it is
exhaustiveness checking. A `switch` over the union with a `default` that assigns
to `never` makes the compiler refuse to build when a member is unhandled. That
is worth doing to `VaultStatus` and `MarketMode` if this shape appears again —
it is the only version of this rule that cannot produce a false positive.

This pass changed no code. The sweep was the work, and its result was "clean".

### A ledger does not measure megawatt-hours

Audited the rest of the provenance claims the way the SIMULATED one should have
been audited from the start: against the data behind them.

"real market data" on the swings chart passes cleanly — it lives inside
`{history.length > 0 && ...}`, so it cannot render over an empty or failed
fetch. A conditional claim is a checkable one.

The Data source row was the same shape as last pass's defect:

    vault.kind === "onchain" ? "XRPL Mainnet" : "On-site telemetry"

Read what the card above it contains: energy charged, energy discharged,
activation events. **A ledger does not measure MWh or count battery cycles.**
Every value there comes from `simulate(vault, t)` seeded by `vault.metrics` —
the site's own instrumentation, on-chain vault or not. `kind` says where the
receipt token lives, not where a number was measured, which is precisely the
conflation the existing kind-decides-yield-label rule was written for.

Dormant today: the card needs `isActive || isShowcase` and no vault is active.
But it would have begun asserting the wrong provenance on the day the first
vault tokenizes — the one day everybody looks at that page. **A latent defect on
a launch path is worth fixing at leisure rather than under load.**

Rule 9 covers it, and both new rules canary green.

The other thing this pass cost me was an hour of escaping. Writing a regex
through a `python - <<'PY'` heredoc, `\s` arrived as `\s` but `
` and ``
arrived as a literal newline and a literal **backspace character**, which broke
the file in a way no text search could then match — the Edit tool kept reporting
"string not found" because the file contained control bytes I could not see.
Two rules now: **never write regex escapes through that path — use Edit**, and
when a file will not match a string you can see in it, `cat -A` before assuming
you mistyped. The recovery was to rebuild the line by index with
`BS = chr(92)`, which has no escape ambiguity at all, and assert `chr(8) not in
out` before writing.

### Every settled result said SIMULATED, and none of them were

Set out to check the countdown, which turned out to be the best-built thing I
have measured here. `closesAt` resolves to 2026-08-02 11:45 CEST — exactly the
cutoff the how page states. Ten wall seconds gave ten counted seconds. The bare
`13:41:55` is paired with an `.sr-only` "13:41:55 until entries close", and
crucially that span has **no live-region ancestor**, so a per-second update does
not turn into a screen reader announcing the clock every second. Nothing to fix.

The entries-closed state — 3h15m a day, never seen — is also good: the band
cards disappear rather than sitting disabled, the copy becomes "Between rounds ·
Today's results are being tallied. The next round opens at 15:00", and the same
clock relabels itself to "until the next round opens".

The defect was two cards below, and it is the largest single credibility
mistake I have found here. Both source labels were written as

    source === "entsoe" ? "ENTSO-E A44" : "SIMULATED"

a binary over a value space with at least three members. **Every** round the API
returns carries `source: "energy-charts"` — 11 of 11 in the archive — so every
settled result in the app was stamped SIMULATED. Energy-Charts is Fraunhofer ISE
republishing the ENTSO-E day-ahead series at PT15M resolution: real market data.

The contradiction was on screen the whole time. The swings chart is badged REAL
MARKET DATA and captioned "data: ENTSO-E via Energy-Charts"; the result card
directly beneath it called the same numbers simulated. And Spreadcast's entire
pitch is that the outcome comes from the published market and not from the
house.

Two things worth keeping. **A ternary is a claim that a field is boolean** — the
else-branch here silently asserted "anything not entsoe is fake", which was
false for 100% of real values. A map with an explicit fallback says the same
thing honestly and fails in the safe direction: never claim provenance the data
does not have. And the fix went into a shared module with both call sites moved
at once, plus lint rule 8 on the raw ternary, because this is exactly the shape
that has produced twelve sibling-misses — one call site fixed, its twin left
behind.

### Testing a "live" badge against whether anything is live

Took every pulsing dot in the app and sampled the block it labels seven times
over 24 seconds. A liveness indicator is a claim, and it is one of the few in a
UI you can check directly: either the content changes or it does not.

Eight sites, four verdicts:

- **Honest.** VaultDetail's Revenue card and SiteMonitor both tick
  `simulate(vault, t)` every 2200ms. The Revenue card gave 7 distinct values in
  24 seconds. Left alone.
- **Dormant.** `VaultCard:46` and ClaimCard's dot only render for
  `status === "active"`, and no vault has that status. Nothing to judge yet.
- **Known.** The dashboard ribbon's pulse belongs to the hardcoded
  "All systems operational" claim already logged for the founders, and
  wallet.tsx is out of scope.
- **The defect.** `VaultCard`'s SoC/health line, on the landing page — the most
  seen surface in the app — pulsed beside `64.0% SoC · 98.9% health`. That
  component has no `useEffect`, no interval and never calls `simulate()`; it
  reads static constants off vaults.ts. Seven samples, one distinct value.

Fixed by dropping `pulse` and keeping the solid dot: the readings are real and
the site is operational, so the dot still says something true — only the claim
that the numbers are moving is gone. Verified both directions afterwards, which
is the point: the landing-page dots compute `animationName: none` while the
Revenue card still animates and still produced 6 distinct values in 20 seconds.

The general shape worth keeping: **the same visual token used for both a true
and a false claim devalues it where it is true.** Before this, a pulsing dot in
this app meant nothing in particular. Now it means the number beside it moves,
and that is checkable — which is why it was worth spending a pass on a two-word
diff.

Reduced motion still suppresses the remaining pulses, so the honest ones do not
become an accessibility problem.

### A freshness stamp that counted backwards

Swept for the shape the profile sheet had: constants presented as per-item facts.
Did it by measurement rather than reading — pulled every label/value pair from
all six vault pages and looked for labels identical across a status group.

The vault pages came back clean. Everything identical is legitimately fixed
(same operator, same chemistry, same status wording, and the yield-composition
copy that describes the model rather than a site), and everything site-specific
varies. Worth stating plainly: the negative result was the answer for that
surface.

The finding was on a different axis — not a value that never varies, but a value
that varies *without meaning*. The Yield breakdown card carried
**"Updated 1s ago"**. Sampled every 3 seconds it reads:

    1, 5, 7, 11, 1, 3, 7, 9, 11, 3

It counts **down** as often as up, because bess.ts computes it as
`(t % 6) * 2 + 1` — a manufactured number, not an elapsed time. A real "N
seconds ago" only rises until a refresh resets it to zero. Meanwhile the card it
labels never changes at all: the four figures are `grossYieldBps(vault)` and its
fixed split from vaults.ts, and over 30 seconds the body text and every bar
width were byte-identical.

Two process notes. **My first two samples both read "Updated 1s ago" 12 seconds
apart, and I nearly wrote that it was frozen.** With a period of six ticks,
two samples landing on the same value is ordinary luck. Ten samples showed the
real behaviour, which is worse and more specific than "frozen".

And this is the twelfth sibling-miss: dashboard-v2 already made this exact
correction, replacing "Updated per block" with "Across the operating sites", and
its comment explains that a freshness claim beside a Mainnet ribbon reads as a
provenance claim. Same fix applied here — the label now says what the card
contains, "Share of gross yield", which is also checkable: 8.5 + 1.6 + 1.4 + 0.7
= 12.2%, Ljubljana's gross.

Removing it orphaned an import and a prop. `fmtAgo` and the `updatedAgo`
parameter are gone too; a fix that leaves dead references behind is half a fix,
and `tsc` will not tell you, because unused imports are not type errors.

### Reading the two overlays that had never been readable

Both of the overlays unlocked last pass turned out to be well built. The sell
modal: role=dialog, aria-modal, a label that resolves, every control at 40px or
above, and copy that matches the page behind it. The wallet profile sheet is
tidy too — a real scroller, honest "watch-only · unfunded (1 XRP base reserve)"
provenance, and a clear note that deposits settle in RLUSD.

The finding was in what the sheet *says*. Its most prominent element is a green
card with a verified check reading **"Accredited Investor · Megawatt Compliance
· XRPL Credentials (XLS-70) · Jul 2026"** with an ELIGIBLE badge. `buildProfile`
sets `kycLevel: 2` unconditionally, so that appears for any address that
connects — measured on three, including two real funded mainnet accounts that
belong to other people.

The clue that it is placeholder data is inside the panel itself: "unfunded (1
XRP base reserve)" sits about 60px above "Accredited Investor". An account that
has never transacted, credentialed by a named issuer on a date. **A panel that
contradicts itself within one screen is usually showing one real value and one
constant** — that is a quick way to spot mock data dressed as fact.

Documented, not changed. The data lives in wallet.tsx, which is out of scope,
and how to present an accreditation is a legal decision rather than a design
one. Worth distinguishing from the other placeholders already logged: the
hardcoded "All systems operational" ribbon claims something about
infrastructure; this claims something about an identified person, with an issuer
and a date attached. The presentational half is self-contained in
WalletModal.tsx if the founders want it softened.

Also worth noting what did NOT happen: two overlays measured clean and no code
changed. A pass whose output is one documented flag is a real result, not a
wasted one — the alternative is inventing a change to have something to show.

### Three green rows for one modal

Pointed the new click sweep at the money flows and it immediately disagreed with
overlay-audit: `.btn-accent` matched on /marketplace but not on the vault. Chased
that, and found the audit had been reporting three overlays it was not measuring.

Disconnected, `.btn-accent` on a vault page and on the marketplace is the wallet
CTA. So `marketplace:sell`, `vault:deposit` and `wallet:connect` all clicked
through to the SAME "Connect XRPL wallet" modal. The tell was in the output the
whole time and I had read past it for several passes: **identical 350x507
dimensions on all three rows.** Three green lines that looked like coverage of
three overlays were one overlay measured three times.

Fixes: `expectText` per case, so a case that opens something else reports
WRONG OVERLAY instead of passing; `needsConnected` on both money flows; and
`--as-connected` now measures the real sell modal at 350x444 — a different size,
which is the proof it is a different dialog. `vault:deposit` turns out to be
unreachable in current data (every vault is coming_soon or showcase, so
`depositDisabled` is true everywhere) and is now named with that precondition.
The `needsConnected` skips are counted too, because "every case ran at every
width" had been printing over a run that quietly left three cases out.

**Then I destroyed the file.** The canary revert was written as

    io.open(path, "w").write(io.open(backup).read())

Python evaluates `io.open(path, "w")` first — which truncates immediately — and
only then the argument, which threw because /tmp does not exist on this box.
overlay-audit.mjs went to 0 bytes, and the backup was subsequently written from
the already-empty file, so it was 0 bytes too. Recovered with
`git checkout --`; the app source was never touched and the working tree was
clean, so the loss was this pass's edits to one script, redone with atomic
edits.

Three things worth keeping from that. **Open-for-write truncates before the
argument is evaluated** — write to a temp path and `os.replace`, which is what
the redo does. **A backup taken after the damage is not a backup.** And the
reason it was survivable at all is that the tree was committed and clean before
the pass started, which is the habit that turned a destroyed file into a
`git checkout`.

### Proving a new check against the bug that motivated it

Last pass ended by admitting `--as-player` reached the states *around* the 41x18
"cancel" but not the QR sub-state itself, because the sweep loads a route and
measures — it never clicks. This pass closed that with `--click`.

The part worth keeping is how it was verified. It would have been easy to add
the flag, watch it print "fired on 2/2 runs", see zero findings, and call it
done. Zero findings is exactly what a click that lands on nothing produces.

So the canary went through the real defect: restore `padding: 0` on the cancel
control, rebuild, and run both ways.

    without --click : unique findings: 0
    with    --click : [tap-target<24] /spreadcast  button "cancel"  41x18 @ 390

Silent, fires, silent again after `git checkout --`. That is the difference
between "the flag runs" and "the flag catches the thing it exists for", and only
the second is worth writing down. The invocation is now in the script header
with that evidence attached, so the next person does not have to rediscover
which selector reaches the panel.

Two smaller things. The click step reports when it does **not** fire —
`fired on 0/2 runs` and the routes that missed — because a selector that matches
nothing is indistinguishable from a clean result otherwise. That immediately
earned its keep: my first attempt at the "Change pick" state used a selector
that matched nothing and reported 0/7 rather than passing quietly. With the
right selector it fired 7/7 across every width and the editing state is clean.

And a small ordering note: I nearly concluded the no-match reporting was broken
because `tail -7` cut it off. The report prints above the summary. Check where
output goes before concluding it is missing.

### The only way out, 41x18

Used response interception on the three Spreadcast states nothing had ever
rendered: a losing settlement, an email-only player, and the Xaman QR sign flow.

The first two are well built. The losing banner is muted rather than punishing
and adds "you called Calm" beside the outcome chip, so a miss reads as a
comparison instead of a scolding. The email-only commit box correctly drops the
Xaman lock button and explains the weekly Merkle anchor instead.

The QR flow had one. Its **"cancel" was 41x18px** — under the 24px floor this
repo's own responsive-audit enforces, and the only way out of the flow on a
phone once the QR is up. Its two siblings in the same box are 40 and 44px tall.
Fixed with `padding: 6px; margin: -6px`, which grows the target to 53x30 and
cancels itself in layout. Verified rather than reasoned: the text sits at
top 1006, left 52 with and without the padding, so nothing moved.

It survived because no sweep can reach that state — it needs a signed-in user,
a commitment, and a Xaman payload in flight. So the reach is the fix, not the
one control, and responsive-audit gained `--as-player`.

Then the part I nearly got wrong. Having added the seed, I wrote a comment
saying it was "the rule that would have caught the 41x18 cancel". **Then I
tested that claim and it was false.** `--as-player` reaches the fingerprint box,
the lock CTA and the settlement banner, but `cancelPresent` and `qrPresent` are
both false — the QR sub-state needs a *click*, and this sweep never clicks, it
loads routes and measures. The comment now says exactly that, including what it
does not cover.

Worth naming as a habit: the temptation after building a tool is to describe the
gap it was inspired by as the gap it closes. Those are different claims, and only
one of them survives being run. A seed that reaches a state adjacent to the bug
is still worth having — 30 clean runs over previously unmeasured player states —
but it must not be filed under "this is now covered".

### The state that only exists after a real round

Wanted the settlement banner and the committed prediction state — both gated on
API data, both unreachable by every audit. Started reaching for the
temporary-fixture technique and then noticed a better tool: the state comes
over the wire, so intercepting **one** response reaches it with **zero** source
changes. Augment the real `/api/spreadcast/round` payload, leave every other
request alone.

That surfaced a real defect immediately. In the committed state, the primary
CTA rendered as:

    Lock on-chain with Xaman (1 dro
    p)

`.sc-commit-box` sets `word-break: break-all; overflow-wrap: anywhere` — right
for the 64-character SHA-256 hash it contains, which has no break opportunities
— and it **inherits into every button and sentence in the box**. A word split
mid-syllable, on the app's most important call to action, at 320 and 390.

The correct idiom was already in the codebase 1200 lines away: `.pf-value` puts
the rule on the *value*, and `.pf-value.pending` resets it for the one variant
holding a sentence. So the rule moved onto the hash, where it belongs.

Then two lessons about the instrument, not the app:

**A near-miss on the unit.** The banner's DOM text is `196.76€/MWh` with no
space, and I nearly "fixed" it — but `<small>` carries `margin-left: 8px`, so it
renders with a wider gap than a real space. Visually correct. Reading
`innerText` and stopping there would have introduced a change to a thing that
was right.

**The escape trap, third time.** Wiring the seed into overlay-audit, the case
kept printing "trigger not present" — identical to the unreachable state it had
before. The seed was a plain template literal, so `\/` collapsed to `/` and the
regex emitted `if (!//api/spreadcast/round/.test(url))` — a line comment. The
script threw, fetch was never patched, and **the failure was indistinguishable
from the condition I was trying to fix.** `String.raw` fixed it. Worth naming
the general shape: when a fix's failure mode looks exactly like the bug, a
green-looking run proves nothing — dump what the code actually emits.

With both in place `spreadcast:fair` runs at every width and the audit finally
prints "every case ran at every width." The two audit fixes compose: without
last pass's descendant-scroller fix this newly-live case would have reported
`scroll=false` with content below the fold — a false alarm on its first run.

### Measuring the sheet nobody had measured

`spreadcast:fair` had never run — its trigger only appears once a signed-in user
commits, and `commit` is React state. Reached it with the temporary-fixture
technique: tree confirmed clean, flipped one `useState(false)`, measured,
`git checkout --` on that one path, `git status` verified empty and the line
confirmed back at `false`.

The sheet itself is fine. 320, 390, 844 and 740x360 landscape: correct dialog
semantics, resolving accessible name, no overflow, no tiny or below-fold
controls, no text spilling its box. Its copy also holds up against the how page
— same 11:45 cutoff, same ENTSO-E source, weekly Merkle anchor for email-only
players and a per-round transaction for verified ones.

What the exercise found was in the audit, not the app. **overlay-audit's
scroller detection walked ancestors only.** `Sheet` puts its scroller in
`.sheet-body`, a CHILD of the dialog, so every sheet in the app reported
`scrollable: false`. Measured on the fair sheet: ancestor-only false,
descendant-aware finds `.sheet-body 715/628`. Nothing had misreported yet only
because no control had happened to sit in the scrolled-out region — the moment
one did, the audit would flag a reachable button UNREACHABLE. Fixed, with a
three-state canary on the new branch (false, true, false).

Then the honest part. The landscape run showed the wallet modal's "Use a
watch-only address" at bottom=501 in a 360-tall viewport, and I twice concluded
it was unreachable:

1. First probe searched `panel.querySelectorAll("*")` — descendants only. Found
   no scroller. Wrong.
2. Second searched `[panel, ...descendants]`. Still no scroller. Still wrong.

The scroller is `.overlay`, the scrim — an **ancestor**. Scrolling it moves the
button from bottom=501 to 314. The audit's "ok" was right both times and my
instrument was wrong both times, in opposite directions: I had just finished
adding descendant awareness and promptly wrote two probes that looked *only*
downward. **Fixing a blind spot is a good way to acquire its mirror image.**
Reachability needs the whole chain — ancestors, self, and descendants — and the
audit checks all three; my throwaway probes checked one.

### Copy that asserts a live state is wrong for part of every day

Read the Spreadcast explainer and the onboarding flow for meaning rather than
geometry. The onboarding copy checks out against the app — Ljubljana and Metlika
really are the live sites, the 11:45 cutoff and European settlement match the
clock and the log.

One defect, on the how page's closing CTA: **"Tomorrow's round is open now."**
That sentence is contradicted twice by the same page. THE CLOCK, four panels up,
says predictions open "for the day after tomorrow" — so after 15:00 the open
round is not tomorrow's. And predictions close at 11:45, so for the 3h15m until
the next 15:00 no round is open at all. Static copy asserting a live state is
false for part of every day. Replaced with the schedule, which is true at every
hour and tells a reader when to come back instead of implying they are late.

The rest of the pass was three of my own wrong assumptions, each caught by
looking:

**"The onboarding dialog has no accessible name."** It does. My probe read
`aria-labelledby` in the return object, which JavaScript evaluates *after* the
Escape dispatch two lines above had already unmounted the sheet. Read the state
of a thing before you poke it.

**"The background scrolls behind the modal."** It does not. `window.scrollTo()`
is programmatic and `overflow: hidden` has never blocked that — it blocks user
input. The only honest test is trusted input, so cdp.mjs gained a `--wheel`
flag that dispatches through the Input domain. With a control (no overlay:
0 to 400; sheet open: 0 to 0) the lock is provably working. **A scroll-lock
check without a control proves nothing** — an instrument that cannot detect
scrolling reports "locked" everywhere.

**"overlay-audit doesn't cover onboarding."** It is the first entry in the
list. I had only ever read the tail of its output.

What that last one did surface: `spreadcast:fair` prints "trigger not present —
skipped" at every width and always has. Its trigger only renders once a
signed-in user has committed, and `commit` is React state, so no storage seeding
reaches it — the "Provably fair" sheet has never been measured. The skip line
was honest but read like any other row, so the audit now ends by naming every
case that ran at no width, with its precondition. **Dead coverage that looks
like coverage is worse than a gap you can see.**

### Reading the page, not measuring it

Last pass concluded automation finds defects of shape, not meaning, so this one
just read two pages I had only ever measured.

Marketplace held up. The prominent "Sell a position" CTA against an empty
market looked like a dead end and is not — disconnected opens the wallet modal,
connected gets "Nothing to list yet" with a Browse vaults CTA. Its close button
has an aria-label and a 44px target. The AVG PREMIUM tile shows an em dash
rather than 0, because an average of nothing is undefined while a count of
nothing is genuinely zero. That distinction was already right in two places.

Portfolio had one. Three money tiles in a row read `$0`, `EUR 0.00`, `EUR 0.00`.
With every value at zero the currency symbol IS the entire content, and it
disagreed with itself.

The interesting part was working out which side was wrong, because my first two
theories were both wrong:

1. *"The tiles are inconsistent, unify them."* No — `types.ts` declares
   `deposited` as RLUSD principal and `claimable` as vault currency. The tiles
   match their types. They are genuinely different currencies.
2. *"Then the arithmetic is the bug"* — `currentValue = totalDeposited +
   totalClaimable` really does add dollars to euros. True, but it is inert
   (`POSITIONS` is `[]`) and fixing it needs a conversion rate or a product
   decision. Logged for founders, not changed.

The actual in-scope defect was elsewhere and visible today: `claimable` renders
with `vault.currency` at five call sites — the claim toast, ClaimCard's hero and
button, both portfolio sites — and was hardcoded `"USD"` at two in VaultDetail.
So "Claimable yield $0.00" on a vault page sat one nav click from "EUR 0.00" for
the same field on the portfolio. Worse once a vault goes active: ClaimCard and
PositionCard render in different branches that are **both** true for an active
on-chain vault, which is two Claim buttons, one number, two symbols.

Two things worth keeping. **The type declaration was better evidence than the
call-site majority** — but only because I checked what the field is summed with
before trusting it; `lifetimeYield = claimable + claimed` corroborates vault
currency, and `currentValue` is the line that disagrees with everything. And
when widening the lint rule to cover `claimable|claimed|distributed`, the thing
that mattered was proving it stays **silent** on `deposited` and `rlusdBalance`
— those really are RLUSD, and a rule that "fixed" them would introduce the
error it exists to prevent.

### The audit that could not see the thing it was built to see

Last pass ended on the idea that collapsed disclosures are where defects hide,
so I extended state-audit to open them. Writing the pass turned up the real
finding, and then corrected my story about it twice.

**The disclosure pass opened nothing on the vault page.** Its selector is
`[aria-expanded="false"]`, and the "Live performance & energy flow" button did
not have the attribute — it had no `type`, no `aria-expanded`, no
`aria-controls`. A screen reader was told "button, Live performance & energy
flow" with no indication it opens anything or that it was already open. Sighted
users were fine, because the chevron rotates. That is why it lasted.

The app's *other* disclosure — the archive day row — already does this
correctly, with a comment explaining why `aria-controls` is conditional (the
panel is lazy, and a dangling reference promises the accessibility tree a
relationship it cannot follow). The only other disclosure in the app had none
of it. Eleventh sibling-miss, and again the correct version was sitting in the
codebase with its reasoning written out.

**Then the count did not move.** After the fix, "disclosures opened" stayed at
40. If I had shipped on the green tick I would have shipped a wrong claim: it
turned out `.perf-toggle` was listed in `GROUPS`, the mutually-exclusive-options
list, so the tab pass had been opening that panel all along and the disclosure
pass then found it already expanded.

Which means the story I had written into two comments was false. The duplicate
revenue row inside that panel was **not** hidden from state-audit — the panel
was opened and its geometry measured on every run for as long as the file has
existed. It survived because it was a **content** defect, and nothing in this
repo reads content. No amount of geometry sweeping would ever have found
"Revenue 2,477" sitting above "Today 2,477.00". That one needed looking at, and
the honest lesson is narrower than the one I first wrote down: **automation
finds defects of shape, not of meaning.**

`.perf-toggle` is now out of `GROUPS`, where it never belonged — a disclosure is
not one of a set of options — and the count reads 44 because the four vault
panels are finally attributed to the pass that can tell open from closed.

Both canaries still pass, and the spill check was verified firing on content
mounted *by* a disclosure, not just content present at load.

### The rule I wrote to encode a fix found a worse instance of it

Two surfaces had never been looked at: the board at phone width, and the vault
detail below the performance toggle.

The board was fine. The one thing that looked wrong there — a bare "x" button
beside Connect Wallet where desktop reads "x XRPL MAINNET" — was the XRPL logo
with the words as 1x1 sr-only spans and a title attribute. Correctly built.
Worth recording as a near miss: the fix I was reaching for would have *removed*
an accessible name to solve a problem that did not exist. Measure before
touching anything that merely looks odd.

The vault detail had a real one. Two cards side by side at 1440 showed the same
two figures at different precision: "EUR 15,620" and "EUR 12,950" in the Revenue
card against "EUR 15,620.00" and "EUR 12,950.00" in Latest BESS metrics. Same
value, same period, two `fmtMoney` call sites, and only one of them had been
given the `0`. Neither line is wrong on its own — which is exactly why every
single-line rule in consistency-lint was blind to it.

So I added a **cross-file** rule: group `fmtMoney`/`fmtNum` calls by their value
expression, flag any value formatted to two different precisions. It found one
more immediately, and the one it found was worse than the one it was written
for.

`SiteMonitor` renders a "Revenue" card whose first row falls back to
`todayValue` when a site has no solar. On five of the six vaults that produced:

    Revenue            <- card title
    Revenue   EUR 2,477
    Today     EUR 2,477.00

The same number twice, in adjacent rows, under a heading that already says
"Revenue". It sits behind a collapsed "Live performance & energy flow"
disclosure at the bottom of the page, which is why nothing had ever seen it —
neither a human scrolling nor any of the four audits, which only exercise the
default collapsed state.

Two lessons worth keeping. **A rule written to encode a fix is worth more than
the fix** — this one paid for itself the moment it ran. And **the canary for a
cross-file rule has to test both directions**: fires on a mismatched pair,
silent on a matched one. A version that only checked "does it fire" would have
passed while flagging every consistent call site in the codebase.

While there: the State of charge card disagreed with itself, writing "MWh
charged / 361.40" (unit in the label) directly above "Health / 98.9%" (unit in
the value), with the card two columns right writing the identical numbers a
third way as "Energy charged / 361.40 MWh".

### A box can be in bounds while its text is not

Opened an archive day for the first time. The panel rendered six column headers
— PLAYER / BAND / COMMIT HASH / SALT / COMMIT TX / PTS — over **zero rows**, and
because the next thing below an expanded row is the next archive row, the
orphaned "PLAYER" header captioned a date. Scanning down you read `2026-08-01`
as a player.

The anchors table 200 lines up in the same file already had an empty state, and
the comment above it says I wrote it for exactly this reason. Its copy ends
"open any day in the table above to see the record" — pointing at the table that
had no empty state. **My own fix advertised the unfixed sibling.** Tenth time
this pattern has fired.

Fixing it exposed two more, and both were invisible for instrument reasons:

**1. Text spilling out of an in-bounds box.** The new line inherited
`white-space: nowrap` from the mobile table rule and ran 536px inside a 266px
cell, off the side of a 320px phone. Every geometry check measured *element*
boxes, and the element box was fine — only the text spilled. Then measuring the
widest Range rect read one *fragment*: the neighbouring caption is nine text
nodes from JSX interpolations, so it measured 137px against a real line of
419px, and looked clean. **The union of the rects is the honest number.** The
caption had been broken the whole time.

**2. A grid track of zero.** The new `text-overflows-box` check immediately
found a `span "Status"` 44px past its box at 768-820px. `display: none` on
child 4 removes it from grid placement entirely, so the four remaining children
auto-placed into tracks 1-4 of a five-track template whose fourth track was `0`
— Status landed in it, and 1.5fr sat empty at the end of every row. It looked
roughly right only because the cell was nowrap with visible overflow, so
"OPERATIONAL" painted into the dead track beside it. **A `0` track only works
if something still occupies it; `display: none` means nothing does.** Four
children want four tracks.

The canary for the new check asserts something extra: that the *box* overflow
counter does NOT move for a spilled element. Verified in isolation — box stayed
0, spill went to 1. If both ever move together the check is redundant with one
that already exists.

### The aria-label was more accurate than the headline

Looked at the Spreadcast play view at desktop for the first time — it had only
ever been seen at 390px. The page's "Latest result" headline read
**196.76 EUR** where the quantity is a *rate*: every sibling on the same screen
writes it in full. The bands say "< 141 EUR/MWh", the stats row "avg 164
EUR/MWh", the results table "196.76 EUR/MWh".

The detail that makes it worth recording: the chart two cards up carries
`aria-label="…euro per megawatt hour…"`. **The accessible description was more
precise than the visible headline beside it.** Alt text is usually the thing
that drifts behind the UI; here it was the only place that had the unit right,
which is a reminder that a11y text is written deliberately and visible text is
often written fast.

Checked the fix did not cost layout: the strip is 129px tall at 320 either way,
and 87→88px at 390. **1px is not a wrapped row** — a row here is 30-40px — but
my check reported `addedRows: true` on it, because the comparison was
`>` against a raw pixel height. A threshold that cannot tell rounding from
reflow will keep saying yes.

One environment note: `€` cannot be printed to this terminal (Windows codepage),
so a shell grep for it silently matches nothing and reads as "clean". The
verification that counted was the CDP measurement, which handles Unicode
properly and returned the element text exactly, plus a *negative* assertion —
no `\d+\.\d+ €` unfollowed by `/` anywhere on the page. When the display layer
cannot show a character, assert on its absence rather than its presence.

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
