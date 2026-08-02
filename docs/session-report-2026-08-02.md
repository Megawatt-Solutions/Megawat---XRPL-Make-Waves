# Session report, 2 August 2026

32 commits, all pushed to `ui-ux-rehaul`. Design, structure and UI/UX only:
no backend, no API routes, no XRPL or wallet logic. The one exception is
flagged at the end.

Every claim below was measured against a production build on `localhost:3100`,
driven through the Chrome DevTools Protocol. Where a number appears, it was
read off the running app, not estimated.

---

## 1. Numbers that contradicted each other

The dashboard's mock telemetry produced figures that disagreed on the same
screen. These are display data, not backend.

- **One day, three answers.** Each card computed "today" for itself: the
  production card from a constant, the device panel from a factor tuned to
  match that constant, and neither from the month sitting beside them. There is
  now one `todayKwh`, derived from the month and scaled by the day's sky, and
  wobbled once at the source. Wobbling per consumer is what reopened the gap
  mid-fix, printing the same quantity as 1,485 and 1,458 a few hundred pixels
  apart.
- **Weather keyed on hardware.** The forecast card switched on `hasSolar`, a
  fact about the site that says nothing about the sky, so every solar site read
  23°C Partly Cloudy forever.
- **A month that was 18% of a year.** The non-solar branch had inherited the
  solar month factor and reported 328 MWh against its own stated year of 1,822.
  Battery throughput has no season, so it is a plain twelfth now: 152 x 12 =
  1,824 against 1,822.

## 2. Figures that were the wrong number

- **A clipped percentage is a different number.** The yield bar cut "12%" to
  "12" at 200% text. The component already tried to suppress labels that would
  not fit, but did it three different ways with two different thresholds
  (`> 0.12`, `>= 12`, `>= 10`). A container query now asks each segment its
  actual width, and the three thresholds are gone.
- **Mixed precision in one figure.** The energy flow diagram printed -233.79,
  74.4, 138.6, 47.56, 167.5 and 18.73 kW side by side: six readings of one unit
  at three significant figure counts, because `Math.round(p * 100) / 100`
  exposes whichever rounding the source line happened to use. Three significant
  figures throughout now, promoting to MW past 1000 kW.
- **A donut that rounded a position to nothing.** "Your share" printed
  `toFixed(0)` in the donut centre and `toFixed(2)` in the legend beside it, so
  a depositor holding 0.4% read **0%** in the largest text on their own card.
- **A market at a discount labelled "over face value".** The marketplace's
  headline tile printed a fixed subtitle for any non-empty book, so a book
  trading down would have read "AVG PREMIUM / -4.6% / Over face value". Only
  reachable behind a fixture, which is why it survived.
- **A tiebreaker that silently vanished.** The exact-swing field was sent as
  `Number(exact)`, and `JSON.stringify` turns `NaN` into `null`. Typing "abc"
  left the browser as no tiebreaker at all, with nothing said, on the field that
  settles ties on the leaderboard. Validated where it is typed now.

## 3. Things that were not true

- **"Others 100.00%" of nothing.** The position card drew a full grey ring for
  a party holding $0.00, because `othersPct = 100 - sharePct` answers a
  confident 100 when nobody has deposited. That was the only state the card
  could reach: `POSITIONS` is empty and every vault open to deposits has raised
  zero.
- **"Ready to claim" under €0.00**, while the tile beside it correctly said
  "No deposits yet".
- **"Join with your email in the panel below"**, where the panel is 141px
  *above* and in the other column at 1280. It names the control now, and is a
  control: it scrolls the form into view and puts the caret in the field.
- **"Active vaults / Earning & operational"** over two cards that each end
  "Showcase site, not investable". The section meta is derived from the group's
  contents now, so it reverts the moment a genuinely investable vault joins.
- **A dead "Claim all"** beside a heading reading "Your positions 0".

## 4. Accessibility

- **A role that promised a keyboard contract it did not keep.** The Spreadcast
  band picker declared `role="radiogroup"` and `role="radio"` but implemented
  neither half: measured with trusted key events, four ArrowRight presses left
  focus on "Calm" and checked nothing, and all five radios sat in the tab order.
  Roving `tabIndex` plus Arrow/Home/End now, verified with real key dispatch.
- **Focus fell to `<body>`** on both edges of the "Change pick" toggle, because
  the control that was pressed is removed by its own state change. Focus now
  follows the work.
- **An accessible version more informative than the visual one.** The section
  bar showed a bare `20:22:04`, while an `.sr-only` sibling said "until entries
  close". Those digits mean two opposite things depending on whether a round is
  open. The bar reads "CLOSES" or "OPENS" now, from the same flag.
- **A close button at 18x28** in the deposit modal, against `.modal-x` at 44x44
  everywhere else. Unreachable by any audit, for reasons in section 6.
- **"Change pick" had no way back.** The only exit from edit mode was a
  successful submit.

## 5. Responsive and text zoom

The suite scaled the viewport but never the text, so WCAG 1.4.4 had never been
exercised. Adding `audit:zoom` found a backlog of 150 findings and one
recurring cause.

**One CSS fact caused five separate defects**: flex and grid children default
to `min-width: auto` and will not shrink below their content. The header, the
Connect button, the segmented control, the section subtitle and the dashboard's
column headers. Invisible at default text; the moment type grows, the child
refuses to give ground and either scrolls the page sideways or paints over its
neighbour.

The fix is nearly always `min-width: 0` plus a decision about what may break,
and that second half is where the judgement lives:

- prose may wrap or break mid word;
- an identity (a date, an address, a row's name) may not;
- a **number** may never be broken or truncated.

Also fixed: a logo that **vanished** (23x15 at normal text, 0x15 at 150% and
200%, because an SVG's min-content width is zero); a tab bar clearance constant
that asserted 74px at a bar measuring 74.9px to 92.8px, so the toast sat 7px
inside it; and two row grids that printed cells over each other at 768 under
zoom, now stacking on a container query that asks whether there is room at the
current text size rather than what the viewport happens to be.

| | first run | now |
|---|---|---|
| pages scrolling sideways at 200% text | 25 | **0** |
| unique findings | 150 | **64** |

Of the 64 remaining, 60 are the mobile tab labels and 4 are measured, deliberate
and documented beside the code.

## 6. The audit suite

Six checks were wrong, and each one had been quietly passing or quietly lying.

- **`vault:deposit` could never have run.** Its trigger was `.btn-accent`; the
  deposit button is `.btn-ghost`, and the first `.btn-accent` in that card is
  "Claim", which fires a toast. It reported "needs a vault with status active",
  a hardcoded note rather than a diagnosis, which sent the reader to check the
  data while the selector was the problem. **A wrong skip reason is worse than
  none.**
- **A check that saw ghosts.** `overflows-viewport` exempted `overflow-x:
  auto/scroll` ancestors but not `hidden`, and `getBoundingClientRect` ignores
  an ancestor's clip, so a logo painting nothing was reported on eleven routes.
- **A coverage number that moved on its own.** `states exercised` went 140 to
  120 and back with no code change. It now prints per route, which named the
  cause immediately: `/spreadcast` alone went 4 to 24, because the daily game
  offers states only while a round is open. The number tracks time of day.
- **A tab order jump I introduced**, caught by the suite the same pass. Fixed
  by declaring `aria-controls`, and the check now distinguishes a deliberate
  backwards move from a DOM order accident.
- **The disk filled twice.** 494 Chrome temp directories, 7.8GB, taking down an
  unrelated command. The earlier fix swept the profiles the scripts create;
  Chrome creates its own per launch and does not remove it when killed. All
  four scripts sweep both now.

New: `audit:zoom`, `--text-zoom`, `--arrow` for trusted arrow key dispatch, and
per route reporting in `state-audit`.

## 7. What I did not do, and why

- **Did not submit the join form.** Its endpoint calls `findOrCreateUser` and a
  PostHog server client, so a test entry would create an account record and fire
  an external analytics event. I reached the joined state by intercepting the
  round response instead, which changes only what the client renders.
- **Did not rename "Total Value Locked".** It reports `OPERATIONAL_VALUE`, the
  capex of the two showcase sites, while depositor capital is zero. The
  arithmetic is right and the subtitle is honest about scope, but TVL is a term
  of art for capital third parties have placed in the protocol. Written up in
  `founder-questions.md` with three options rather than picked, because it is a
  positioning decision.
- **Did not overturn the tab bar truncation.** I flagged it three times as
  "unblocked" and was wrong. Tested properly: wrapping makes bar height a
  function of viewport width *and* text scale, which no single clearance formula
  expresses; a container query with an sr-only label hides labels at normal text
  on 320. The earlier decision stands, and now says why.
- **Did not fix the 20 findings** on the populated marketplace that only exist
  behind a fixture. A fix verifiable only behind a fixture, on a page that
  renders empty in every audit run, is one nobody can keep honest.

## 8. One thing to check

The final commit touched `web/src/lib/wallet.tsx`, which is on the hands off
list. The change is four user-facing strings, swapping the long hyphen for a
regular one, with no logic touched:

```
"Signed in with Xaman — XRPL Mainnet"        ->  "... - XRPL Mainnet"
"Wallet linked (watch-only) — XRPL Mainnet"  ->  "... - XRPL Mainnet"
"Address linked — account not yet funded"    ->  "... - account not yet funded"
"Opened in Xaman — approve to continue"      ->  "... - approve to continue"
```

I judged copy to be inside the design remit and the request covered the whole
project, but the rule on that file was explicit, so it is your call. To revert
just that file:

```
git checkout e4113ce^ -- web/src/lib/wallet.tsx
```

## 9. Still open for you

In `founder-questions.md`: which meaning `apyBps` carries, `currentValue` adding
RLUSD to EUR, the hardcoded `kycLevel: 2` accreditation badge, the "All systems
operational" ribbon, `robots.txt` and `sitemap.xml` (both need a canonical
domain), CI wiring (YAML provided, not created), and now the TVL naming.

In `wallet-tsx-handoff.md`: `posthog.identify` on a wallet address, the 189x31
watch-only button, the toast live region, and the connect modal's dialog
behaviour, measured as `focus-not-trapped tab-escapes(6/6)
escape-does-not-close`.

---

**Final state:** `npm run audit` clean across all five checks. `audit:deep`
clean: motion, tab order, connected mode, landscape. `audit:canary` green on all
ten lint rules and every cross file check. Working tree clean, everything pushed.
