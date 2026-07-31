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

**Still unobserved:** `.sc-cta-dock` is the third sticky element, and it only
renders before a pick is committed. Its `bottom: var(--nav-h-safe)` was written
when sticky was broken, so that fix has never actually been exercised. It will
behave as designed or it will not — nobody has seen it either way. Check it
during an open round.

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

### Empty demo data hides whole layouts from every audit

`LISTINGS` and `POSITIONS` are both `[]`. Sweeping `/marketplace` at seven
widths therefore reported a clean page at every one of them — `.mk-head` was
`display: none` everywhere and `.mk-row` never existed. **Two breakpoints of
row CSS had never once rendered**, in this browser or any other, and the audit
could not tell the difference between "correct" and "absent".

So: before trusting a pass over a data-driven surface, check that the data is
non-empty. If it isn't, populate it temporarily from the real interface in
`src/lib/types.ts` (not from what the screen appears to show — see the
`GrowthPoint.yield` mistake), audit, then revert with `git checkout --` and
confirm with `git status`. Writing the file back through PowerShell flips CRLF
to LF and leaves it modified with an empty content diff; `git checkout --` is
what actually restores it.

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

Not done yet, and deliberately: `POSITIONS` and the marketplace listings are
both empty in the current demo data, so there is nothing to verify a naming
strategy against. Designing accessible names for rows that do not exist is how
you ship something that reads badly the day real data arrives. **Do this in the
same change that gives either surface real rows.**

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
