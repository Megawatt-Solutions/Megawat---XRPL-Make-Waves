# UI/UX Rehaul — fusing Spreadcast into Megawatt

**Branch:** `ui-ux-rehaul`
**Scope:** `web/` — **design, structure, and UI/UX only.** No backend, no web3 connectors. See [§0](#0-scope-constraint--design-structure-uiux-only).
**Status:** Phase 0 (token foundation) complete and verified. Phases 1–3 pending.
**Last updated:** 2026-07-30

---

## How to read this doc

Claims are tagged so you can tell what is checked from what is judgement:

- **[VERIFIED]** — confirmed against this repo, the live brand kit, or the Claude Design project. Reproduce with the commands in [Appendix A](#appendix-a--verification-commands).
- **[DECISION]** — a call we are making. Reversible, but stop and think before reversing.
- **[OPEN]** — genuinely undecided. Needs a human or a test.

---

## 0. Scope constraint — design, structure, UI/UX only

**Rule (from CTO):** *do not change any backend, any web3 connectors, or anything else. Design, structure, and UI/UX only.*

### Hands off — do not modify

| Path | Why |
|---|---|
| `src/app/api/**` | backend |
| `src/lib/spreadcast/{store,session,scoring,merkle,prices,spread,time,xrplink,prizes,bands}.ts` | game logic + backend |
| `src/lib/wallet.tsx` | web3 connector |
| `src/lib/xrpl.ts` | web3 connector |
| `worker/`, `contracts/`, `operator/` | outside `web/` entirely |

### In scope

- `src/app/globals.css` — all token and style work
- `src/app/**/page.tsx`, `src/app/**/layout.tsx` — routing **structure** and page composition
- `src/components/**` — markup, styling, composition, new presentational components
- `src/app/layout.tsx` — font weights, `viewport` export (presentation metadata only)

### The line, stated precisely

**Consuming** an existing hook or endpoint is UI work. **Changing** one is not.

- ✅ Reading `useWallet()` in a component to decide what to render
- ✅ `fetch`ing `/api/spreadcast/round` from a new presentational component
- ✅ Changing *which value* existing UI hands to an existing endpoint
- ❌ Editing `wallet.tsx` to fire something on connect
- ❌ Adding a field to an API response, or a new route under `api/`
- ❌ Changing `WalletModal`'s connect logic (restyling it is fine)

### What this costs

One thing, and it is the deepest of the four app-in-app signals: the identity split cannot be *automatically* closed without touching `wallet.tsx`. See §4 — there is a UI-only version that recovers most of the value, and a handoff note for the rest.

### What it doesn't cost

**[VERIFIED]** Almost nothing else. `/api/spreadcast/round` already returns everything the planned UI needs, from a single existing endpoint:

| Planned UI | Field already returned |
|---|---|
| Countdown | `now`, `open.closesAt` |
| Band rows | `open.bands`, `open.boundaries` |
| Social proof | `open.participants` |
| Locked status strip | `mine.{band, exact}` |
| Provably-fair sheet | `mine.{hash, txHash}` |
| Settlement result screen | `latest.{spread, outcomeBand, outcomeLabel, source, hourly}` |
| Streak chip + multiplier | `latest.mine.{correct, points, streak}` |
| `/vault/[id]` spread line | `latest.{spread, outcomeLabel}` |
| Wallet state inside the game | `user.{name, verified, wallet}` |

Phases 0, 1 and 2 below are fully buildable under this constraint.

---

## 1. The problem

Spreadcast was redesigned in Claude Design as a **standalone mobile app**: its own onboarding funnel, its own 4-tab bottom nav, its own bottom sheets, its own first-run coach. Dropped into Megawatt as-is, it reads as an app inside an app.

The app-in-app feeling is **not** caused by having two nav bars. It is caused by two *runtimes*. Four signals fire at once, and navigation is the least important of them:

| # | Signal | Evidence |
|---|---|---|
| 1 | **Two wordmarks** | `SPREADCAST▊` renders directly beneath the Megawatt brand |
| 2 | **Two identities** | `sc_session` HttpOnly cookie (`src/lib/spreadcast/session.ts`) runs parallel to `mw.xrplAddress` in localStorage. **Zero** files under `src/components/spreadcast/` import `useWallet` **[VERIFIED]** |
| 3 | **Two navigation models** | global `.bottom-nav` (5 items) + the redesign's own 4-tab bar |
| 4 | **Two visual systems** | see §3 — and both differ from the brand |

**Signal 2 is the one that actually kills the demo.** A judge connects a wallet in the header, taps Spreadcast, and is still anonymous. No amount of shell fusion survives that moment.

The seam already exists in miniature: `/spreadcast` today renders the global `.bottom-nav` **plus** the `.sc-tabs` strip before its H1.

---

## 2. The decision — "One Shell, One Clock"

> Spreadcast becomes a **section** of Megawatt, not an app you enter. One nav, one modal system, one canvas — plus a section bar whose countdown lives in a layout and therefore **never remounts** as you move between the game's tabs.

**[DECISION]** Chosen over four alternatives (full-screen takeover, morphing tab bar, full dissolve, two-worlds app switcher). Two of three evaluation lenses (mobile-UX, build-reality) picked it; the demo-impact lens dissented — see §2.3.

### 2.1 Mobile layout, top to bottom

1. **Existing 58px `.nav`** — unchanged. Brand left, `ChainSelect` + wallet pill right.
2. **New 44px section bar** — sticky at `top: 58px`, full-bleed, Carbon @ 92% + blur, 1px bottom hairline, `z-index: 45`.
   - *Left:* `PLAY · BOARD · LOG · HOW` as **four real routes**. Brand eyebrow style: 12px mono, weight 500, uppercase, `+0.16em`, 2px accent underline on active. Deliberately the same idiom as `.nav-link` — **not** a new pill control.
   - *Right,* behind a `border-left`: pulsing dot + `T-01:47:12` in tabular-nums + streak chip `🔥 7 ·×3`.
   - Never hides on scroll, never shrinks.
3. **SPREADCAST wordmark demoted** to the Play route's `h1` — a page title, not an app identity. This alone kills signal 1.
4. **Five full-width 52px band rows**, replacing the 5-across `.sc-bands` grid (currently ~65px per band at 390px — the tightest element in the shipped app).
5. **Sticky "Lock in forecast" CTA docked flush against the bottom nav** — same background, same blur, no gap, sharing its hairline, so CTA + tab bar read as one ~130px assembly rather than a button colliding with chrome.
6. **Global `.bottom-nav`** — still 5 items, still the only bar that ever exists.

### 2.2 Nav changes

**[DECISION]** In `src/components/TopNav.tsx`, move Spreadcast in `LINKS` from index 4 → **index 2**, putting the daily ritual in the centre thumb slot. One tap from anywhere.

Its `BoltIcon` gains a 5px status dot:

| State | Dot |
|---|---|
| Round open, not locked | pulsing accent |
| Under 30 min to close | amber |
| Locked | solid accent |
| Settled, result unseen | small numeral |
| Nothing to do | none |

### 2.3 Where the evaluation split, and how it resolved

The demo-impact lens picked a different approach — **"The Daily Call"**, which dissolves Spreadcast into the home screen on the thesis that:

> A BESS earns by buying at the day's low and selling at the day's high. **The spread *is* the revenue.** So forecasting it is a Megawatt behaviour, not a side game.

That thesis is correct and it is the best sentence the exercise produced. But its architecture moves the home route, adds a second sticky row over *every* screen including vault detail, and has **no intermediate state where the app is coherent**. Half-landed the night before the demo, it takes the vaults half down with the game.

**[DECISION]** Steal the thesis, refuse the blast radius. Keep the section, and add one line under the revenue block on `/vault/[id]`:

```
YESTERDAY'S SPREAD  112.12 · SWINGY
```

coloured from the band ramp. ~10 lines, and it makes the argument on the screen where it lands hardest.

### 2.4 Desktop

Same section bar, same 44px, same `top: 58px`. Tabs left-align under the top nav's links; the status cluster right-aligns under the wallet pill — a two-tier terminal header for the cost of one `justify-content` change. Play goes 2-up, which converts two of the seven sheets into right-column content.

---

## 3. Brand foundation — the authoritative part

This section supersedes any earlier token advice. **[VERIFIED]** against three independent sources that agree exactly:

1. The live brand kit — `https://www.megawatt.solutions/brand/colors/colors.css` and `colors/tokens.json`
2. The Claude Design DS bundle — `_ds/megawatt-design-system-…/tokens/*.css`, declared "values from Figma Variables"
3. The SVGs already in this repo — `web/public/brand/megawatt-symbol-{dark,green}.svg`

### 3.1 Colour — five brand colours, verbatim

```css
--mw-color-megawatt-green: #42e7aa;
--mw-color-carbon:         #030907;
--mw-color-paper:          #ffffff;
--mw-color-conduit-gray:   #737373;
--mw-color-mist:           #f5f5f5;
```

With usage semantics from `tokens.json`:

| Token | Role | Constraint |
|---|---|---|
| Megawatt Green `#42E7AA` | signal, CTAs, brand moments | **"~2% of any surface"** |
| Carbon `#030907` | near-black brand ink; display type, body, wordmark | |
| Paper `#FFFFFF` | white surface, inverted marks | |
| Conduit Gray `#737373` | secondary text, structural detail | |
| Mist `#F5F5F5` | dividers, hovers, secondary panels | |

Brand guidance: *"Carbon and Paper carry weight; Megawatt Green appears only where it earns the eye."*

> **The ~2% rule is the sharpest constraint in the whole brand system.** It is the reason the band ramp has to be desaturated (§3.5) — every extra saturated colour steals from the accent's 2%.

### 3.2 Radius — this overturns earlier advice

Brand Radius collection, from Figma Variables:

```css
--radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-full: 999px;
```

**There is no `0` in the brand radius scale.** The brand is *rounded*.

**[VERIFIED]** `globals.css` currently sets `--radius: 0px`, `--radius-lg: 0px`, `--radius-sm: 0px`, plus **15** hardcoded `border-radius: 0` rules.

**[DECISION]** The shipped app's square/industrial treatment is **off-brand drift, not a house style to defend.** Adopt the brand scale, assigned by object role:

| Role token | Brand value | Applies to |
|---|---|---|
| `--r-control` | `6px` (`--radius-sm`) | buttons, inputs, chips, small controls |
| `--r-row` | `10px` (`--radius-md`) | band rows, list rows, segmented controls |
| `--r-surface` | `16px` (`--radius-lg`) | cards, panels, tiles |
| `--r-overlay` | `16px 16px 0 0` | bottom sheets |
| `--r-full` | `999px` | pills, dots, avatars, grab handles |

Note this **corrects** an earlier recommendation of `--r-surface: 0`. That was made before the brand radius scale was in hand and is wrong — it would have preserved the drift.

The redesign's ad-hoc 12–14px cards and 22px sheets should **snap to the brand scale** (16px). The mechanical win: most of the 15 hardcoded `border-radius: 0` rules are `.btn`, `.btn-sm`, `.input`, `.sc-field`, `.v2-select`, `.segbar`, `.bottom-nav-item` — exactly the controls that should move. **The work list and the win list are the same list.**

### 3.3 Typography

From the brand type scale — *"16px base, major-third (1.250) desktop / minor-third (1.200) mobile. Single breakpoint at 768px. Body never below 16px. Eyebrows are 500-weight MONO, uppercase, +0.16em."*

Brand fonts: **Inter** 400/500/600/700 · **JetBrains Mono** 400/500.

**[VERIFIED]** Current drift:

| Thing | Now | Brand | Action |
|---|---|---|---|
| `body` font-size | `14px` | `16px` — *"body never below 16px"* | raise |
| JetBrains Mono weights | `400, 500, 600` loaded in `layout.tsx` | `400, 500` | **drop 600** |
| `.nav-link` eyebrow | 11px, `0.12em` | 12px, `+0.16em`, weight 500 | align |
| Type breakpoint | nav flips at 980px | brand single breakpoint 768px | see [OPEN] below |

**[OPEN]** The 980px nav breakpoint is a *product* decision (when the desktop nav can fit), not a brand one. Recommend: adopt 768px for the **type scale**, keep 980px for the **nav flip**. Two breakpoints doing two different jobs is fine; document it so it doesn't read as an accident.

**[DECISION]** Rule that covers both halves: **Inter = human, JetBrains Mono = machine.** The *shipped app* is the side violating it — `.tile-value` and `.v2-metric-value` are numbers set in Inter, while `.sc-countdown` and `.sc-result-num` already correctly use mono. Pull the former into mono. Floor mono labels at 9px (three rules currently go to 8.5px).

### 3.4 Motion

```css
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);   /* annotated "from megawatt-landing" */
--ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);
--transition-fast: all 0.2s var(--ease-out);
```

**[VERIFIED]** `--ease-out` is annotated in the DS bundle as lifted from the live landing page — and it is **identical** to the redesign's `ssPop` / `ssUp` curve. The brand, the landing page, and the Spreadcast redesign already agree on motion. Only the shipped app disagrees (`popIn` uses an overshoot `cubic-bezier(0.34, 1.3, 0.5, 1)`).

**[DECISION]**
- Standardise on `--ease: cubic-bezier(.22,1,.36,1)` app-wide; retire the `popIn` overshoot.
- **Do not** port `ssPop` onto route containers. Animating a whole page under fixed chrome is itself part of the app-in-app feel.
- Add a `prefers-reduced-motion` block. **[VERIFIED]** neither half has one, and both ship infinite loops (`ssPulse`, `ssBlink`).
- Suppress first-paint animation: mount with animations off, enable inside `requestAnimationFrame`. Otherwise a deep link into `/spreadcast/board` plays an entrance that reads as a glitch.

### 3.5 Surfaces, borders, bands

**Canvas → Carbon `#030907`.** **[DECISION]** This also corrects earlier advice ("keep `#0a0b0a`"). Neither the app's `#0a0b0a` nor the redesign's `#121212` is a brand colour. `#121212` is a device-frame artifact and chromatically neutral; `#0a0b0a` is near-neutral drift. Carbon is green-tinted (`03/09/07`), which is what makes the whole surface ladder feel branded rather than generic-dark.

Rebase the existing ladder on Carbon, preserving the step sizes (which are good — slightly larger than the redesign's):

| Token | Now | Proposed |
|---|---|---|
| `--bg` | `#0a0b0a` | `#030907` (Carbon) |
| `--surface` | `#0e1110` | ~`#070f0c` |
| `--card` | `#141817` | ~`#0c1713` |
| `--card-2` | `#181d1b` | ~`#112019` |
| `--elevated` | `#1c2220` | ~`#16281f` |
| `--sheet` *(new)* | — | ~`#1b2f25` |
| `--toast` *(new)* | — | ~`#20372b` |

**[OPEN]** The proposed ladder values are derived, not tested. Check them on a real phone in a dark room before locking. The *principle* (rebase on Carbon, keep step sizes, add two steps above `--elevated`) is settled; the exact hexes are not.

Two new steps are required because a sheet at `--card-2` over a `--card` page will not visually separate.

**Borders.** Brand ring on dark is `inset 0 0 0 1px rgba(255,255,255,0.1)`. **[VERIFIED]** the app uses `--border: rgba(255,255,255,0.06)`. A hairline-built system at 0.06 white on a near-black card is invisible on a phone.

**[DECISION]** `--border` `0.06 → 0.10` (brand value), `--border-2` `0.10 → 0.14`.

**Accent → `#42E7AA`.** **[VERIFIED]** this is a defect fix, not a preference: `src/app/icon.svg` and `public/brand/megawatt-symbol-green.svg` both ship `#42E7AA`, while `TopNav.tsx:32` renders the same mark at `var(--accent)` = `#34d399` (which is just Tailwind emerald-400). **Your favicon and your nav mark are the same mark in two different greens, 30px apart in browser chrome.**

Hue differs by ~0.3°, so the swap is imperceptible in situ — but it is **not** a one-line token flip. **[VERIFIED]** **27** hardcoded `rgba(52, 211, 153, …)` literals bypass the token across `globals.css` and components, plus Chart.js configs in `GrowthChart.tsx`, `OverviewChart.tsx`, `SiteChart.tsx`. De-literalise to `color-mix(in srgb, var(--accent) X%, transparent)` and thread the accent into charts via `getComputedStyle` **first**, or the seam gets installed *inside* the vaults half.

**Bands.** **[VERIFIED]** `--sc-b1` (band "Steady") is *literally* `#34d399` — the primary action colour. A band is indistinguishable from a CTA.

**[DECISION]** Adopt the redesign's already-knocked-back ramp (~40–50% chroma):

| Band | Now | Adopt |
|---|---|---|
| Calm | `#6b8cff` | `#7FA8D9` |
| Steady | `#34d399` ⚠ | `#55B89A` |
| Lively | `#f4b53e` | `#D9B356` |
| Swingy | `#f4813e` | `#D98D4F` |
| Wild | `#f76b6b` | `#D96A6A` |

This is what makes the ~2% green rule satisfiable: after the knock-back, the accent is the only saturated thing on screen. It also makes the ramp legal to reuse *outside* the game — the vault-detail spread line (§2.3), settlement toasts.

Same reasoning applies to `--red` / `--blue` / `--amber`, currently as saturated as the accent.

---

## 4. Identity — the deepest signal, solved within scope

### The situation

**[VERIFIED]** `src/app/api/spreadcast/wallet/route.ts` accepts a raw r-address with **no signature**. It is honestly self-documented as prototype mode:

> *"Prototype wallet connect: accepts an r-address directly and marks the player verified. Production replaces this with a Xaman sign-in payload so ownership of the address is cryptographically proven."*

Acceptable for a demo. But combined with `PlayView.tsx:469` having its own manual r-address input (`placeholder="rYourXrplAddress…"`), a user can be **address A in the header and address B in the game**, with nothing reconciling them.

### The UI-only bridge — **in scope**

**[VERIFIED]** the wiring to do this already exists on both ends:

- `PlayView.tsx:104-107` already POSTs `{ address: wallet }` to `/api/spreadcast/wallet`
- `useWallet()` already exposes `connected: boolean` and `profile.address`

**[DECISION]** In `PlayView.tsx` — a presentational component — read `useWallet()`, and when `connected`, **replace the manual text input with a one-tap "Link this wallet" row** that passes `profile.address` into the *same existing fetch call*.

This changes only *which value the existing UI hands to the existing endpoint*. Nothing in `api/`, nothing in `wallet.tsx`, nothing in `lib/spreadcast/`.

It also lets the game render honestly: `/round` already returns `user.wallet`, so the UI can compare it against `profile.address` and show one of three states — linked, connected-but-unlinked (offer the row), or not connected. **Never render "connected" off the header's state alone** — that would be the UI claiming a binding that doesn't exist, which is worse than the current honest split.

### What stays out of scope — handoff note

Making the bind **automatic on connect** requires firing it from `src/lib/wallet.tsx`, which is a connector. Not ours.

For whoever picks it up: on successful `connect()`, POST the already-proven address to `/api/spreadcast/wallet` and derive `verified` from the server. ~30 lines. Until then the one-tap row above is the full extent of what UI can honestly do, and it is close: the difference is one deliberate tap versus zero.

---

## 5. The onboarding funnel

The funnel exists to paper over the identity split. Close the split and six of seven screens have nothing left to do.

| Screen | Fate | Why |
|---|---|---|
| **O1 Value intro** | Survives as **content**, dies as a screen | Becomes a panel at the top of `/spreadcast` when there's no `sc_session`. Vanishes once a session exists. Never a route, never blocking |
| **O2 Connect** | **Delete** | Second implementation of `XrplConnectModal` (`src/lib/wallet.tsx:174-347`), which already does the real Xaman SignIn payload, QR, deep link, 2.5s polling, and a watch-only fallback the design has no concept of. Button becomes `useWallet().connect()` |
| **O2e Email sign-in** | Survives as a **form**, not a flow — **already built** | The free-to-play door. **[VERIFIED]** `PlayView.tsx:448-449` *already has* inline email + display-name fields, which is exactly what this plan wants — restyle, don't rebuild. **[VERIFIED]** there is no magic-link backend (`/api/spreadcast/join` sets the cookie instantly), so **cut the "check your inbox" screen** from the redesign. Don't ship a button that lies |
| **O3 Handshake** | **Delete** | `wallet.tsx:213-240` already implements signed/cancelled/expired/opened against the real API. The only unique artifact — the `VERIFIED` confirmation — is already emitted as a toast at `wallet.tsx:136-142` |
| **O4 Activation check** | Survives, **promoted out of the game** | Becomes a shell-wide banner keyed on `profile.funded === false` (already fetched on every connect, currently buried in a toast string). Vault depositors hit the same 1 XRP reserve wall. **The same banner in both halves is the quietest possible proof there is one account underneath** |
| **O5 Display name** | Survives as a **prompt**, not a step — **field already built** | **[VERIFIED]** `PlayView.tsx:449` already has the input; restyle it into the join form or a one-time sheet at first lock-in. ⚠ The redesign's live CHECKING / AVAILABLE / TAKEN affordance needs a 409-shaped response from `/join` — **backend, out of scope.** Ship the field without live validation and handle the error on submit |
| **O7 Returning user** | **Delete** | `wallet.tsx:110-127` already silently reconnects on mount |

### The coach tour

**[DECISION]** Kill the spotlight, keep the teaching.

Its three steps are positioned by hardcoded pixels (`top:108px`, `top:456px`, `bottom:205px`) that assume a 390×844 frame and do not transfer. `coach` / `scoreCard` are plain component state and will replay on every mount.

Replace with an **inline hint line above the bands that advances with form state**:

```
PICK A BAND  →  ADD AN EXACT GUESS  →  LOCK IN BEFORE 11:45 CET
```

Correct by construction, no pixel anchoring, no replay bug, and a returning user blows past it in two taps.

Persist `mw.sc.coach`, `mw.sc.scorecard`, `mw.sc.reminders`, `mw.sc.seen.<day>` alongside `mw.xrplAddress` regardless.

### The best structural move

**[DECISION]** Let anonymous users **tap a band and type an exact spread before they are anyone.** Move the identity wall to the **Lock** button, where it opens one sheet with two doors — *Connect with Xaman* / *Play free with email* — and **the band pick survives the sheet.**

That collapses O1 + O2 + O2e + O3 + O5 into a single sheet fired at demonstrated intent.

**In scope:** this is pure UI gating. Hold the band pick and exact guess in component state and only POST to `/api/spreadcast/predict` *after* identity exists. No endpoint changes — the UI simply defers the call it already makes. The two doors reuse `useWallet().connect()` and the existing email/name fields respectively.

---

## 6. Implementation order

Ordered for **testability**: each phase leaves the app coherent and demoable. Stop at any phase boundary without a broken demo.

### Phase 0 — foundation ✅ **DONE**

Nothing else is verifiable until this lands, and **half-done is worse than not done** — the seam just relocates inside the vaults half.

- [x] De-literalised **26** `rgba(…)` values in `globals.css` + **5** in component inline styles → `color-mix(in srgb, var(--token) X%, transparent)`
- [x] Threaded tokens into all 3 Chart.js components via a new `src/lib/chartTheme.ts`
- [x] `--accent` → `#42E7AA`; `--bg` → Carbon `#030907`; surface ladder rebased
- [x] Added `--sheet` + `--toast` steps
- [x] `--border` → `0.10` (brand ring value), `--border-2` → `0.14`
- [x] Added 5 radius role tokens; rewrote the **15** hardcoded `border-radius: 0` rules — **plus an unplanned second wave, see below**
- [x] Swapped the band ramp; knocked `--red`/`--blue`/`--amber` back
- [x] One `--ease: cubic-bezier(.22,1,.36,1)`; retired the `popIn` overshoot
- [x] Added `prefers-reduced-motion`
- [x] `body` 14px → 16px/26px; mono weights → `["400","500"]`; `.nav-link` eyebrow → 12px `+0.16em`
- [x] Added `export const viewport = { viewportFit: 'cover', themeColor: '#030907' }`
- [x] `--nav-h-safe` published; `.page` padding-bottom and `.toasts` repointed at it

**Verified:** `tsc --noEmit` clean · `next build` clean (20/20 routes) · live token read on `/dashboard-v2` confirms `--bg #030907`, `--accent #42e7aa`, `--r-surface 16px`, body `16px/26px`, `.nav-link` `12px/1.92px` tracking · no horizontal overflow, no element overflowing its container.

#### Two things the plan didn't anticipate

**1. Square by omission.** The plan said "rewrite the 15 hardcoded `border-radius: 0` rules". That was necessary but *not sufficient* — a second set of elements had **no `border-radius` declaration at all**, so they defaulted to 0 and the sweep missed them. Found by querying the live DOM for elements with a border/background and a 0 radius. **18 more rules** were given role tokens: `.connect-btn`, `.wallet-pill`, `.chain-btn`, `.chain-menu`, `.badge`, `.sc-pill`, `.sc-tag`, `.v2-projected`, `.chain-net`, `.ribbon`, `.surface`, `.sc-commit-box`, `.sc-prizebar`, `.seg`, `.sc-seg`, `.v2-charts`, `.sc-bands`, `.panel`.

Left deliberately square: `body`, `.nav`, `.bottom-nav` (full-bleed chrome), `.v2-footer`, `.site-total` (divider rows).

**2. The corner-tick motif collided with the radius decision.** `.tick` marks were positioned at `-1px` to hang off a *square* corner. Rounding `.panel` to 16px (and clipping its inner shared borders with `overflow: hidden`) would have clipped them away entirely. They are now inset to `7px` and read as registration marks just inside the curve. **[OPEN]** — this is a real design change to an existing signature; worth a look before Phase 1.

**3. Mono weight sweep was larger than "change the font loader".** Dropping weight 600 from `JetBrains_Mono({weight})` alone would have left **17** mono rules rendering faux-bold. All 17 were capped at the brand's 500 first, so the loader change is safe.

**[VERIFIED]** that last one matters: there is **no viewport export anywhere in `src`**, so `env(safe-area-inset-bottom)` currently evaluates to `0` and the `max(10px, env(...))` already sitting in `.bottom-nav` is dead code.

Also publish **one** number for nav clearance:

```css
--nav-h-safe: calc(74px + env(safe-area-inset-bottom));
```

and repoint `.page { padding-bottom }` and `.toasts` at it. **[VERIFIED]** `.toasts` sits at `bottom: 22px` with no mobile override — every toast currently lands on the tab labels.

**Test:** vaults half looks identical-but-warmer, nothing regressed, charts still accent-coloured.

### Phase 1 — identity, UI-only (§4)

All within scope — no `api/`, no `wallet.tsx`, no `lib/spreadcast/`.

- [ ] Read `useWallet()` in `PlayView.tsx`; derive three states by comparing `profile.address` against `/round`'s `user.wallet`: **linked** / **connected-but-unlinked** / **not connected**
- [ ] Replace the manual `rYourXrplAddress…` input (`PlayView.tsx:469`) with a one-tap **"Link this wallet"** row that feeds `profile.address` into the existing fetch at `PlayView.tsx:104`
- [ ] Never render "connected" from header state alone — show the unlinked state honestly
- [ ] Don't build O1 / O2 / O3 / O7 from the redesign (§5)
- [ ] Restyle the existing email + display-name fields (`PlayView.tsx:448-449`) rather than rebuilding them

**Highest ratio of problem-solved to code-written in the whole plan.**

**Test:** connect in the header → tap into Spreadcast → one tap links it, and the game shows your address. Not the zero-tap version that needs `wallet.tsx`, but the contradiction is gone.

### Phase 2 — the shell

- [ ] `src/app/spreadcast/layout.tsx` + section bar component
- [ ] Four real routes: `/spreadcast` (play), `/board`, `/log`, `/how`
- [ ] Delete `.sc-tabs`
- [ ] Move Spreadcast to `LINKS` index 2; add the status dot
- [ ] Full-width band rows; dock the CTA against the bottom nav

**[VERIFIED]** `src/app/layout.tsx` is currently the **only** layout in the tree — no route groups, no templates. So this is purely additive; nothing existing can break from the structure itself. The four views take no props and self-fetch, so each page file is ~4 lines.

**Net chrome goes *down*** — the in-page tab strip disappears the same day.

**Test at 360px, not 390px** — see §7.

### Phase 3 — content

Stacks cleanly, stops anywhere. **[VERIFIED]** every item here reads from data `/api/spreadcast/round` and `/archive/[day]` already return — no endpoint changes anywhere in this phase.

- [ ] Locked state as a **status strip**, not a screen: `LOCKED · STEADY · €62-88` / `RESULTS IN 04:12:33` + ghost "Change pick", from `mine.{band, exact}`. Resolves redesign-says-locked vs API-says-editable with zero backend change and no game-rule change smuggled in under a visual refactor
- [ ] Ship the `Sheet` primitive on `WalletModal` **first** — the first bottom sheet a user meets should be a *vaults* sheet. That is what makes sheets read as the app's overlay language rather than something the game imported. ⚠ **Restyle only — do not touch `WalletModal`'s connect logic**
- [ ] Settlement result screen; streak calendar; provably-fair, share, reminders sheets
- [ ] `/vault/[id]` spread line (§2.3)
- [ ] Grid-side promo strip on `/dashboard-v2` and `/` — 3px top rule in the band gradient, `FREE DAILY GAME · SI DAY-AHEAD`, live countdown. The only cross-sell surface for the vaults half
- [ ] `/spreadcast/result/[day]` as a cold-entry surface from the Share card — needs `‹ MEGAWATT` in a 44px target, backed by `sessionStorage`, **not** `history.length`
- [ ] Lift the 4 game glyphs from `Spreadcast.dc.html` (lines 706/710/714/718) through the existing `svg()` factory in `Icons.tsx`

---

## 7. Known risks

**Chrome budget.** 58 + 44 + 74 ≈ **177px of an 844px viewport (~21%)** before the sticky CTA. The `HOW SCORING WORKS` card must default collapsed.

**Width.** Four tabs + countdown + streak chip lands around **310px of 358px usable at 390px**. **Test at 360px.** If it overflows, demote the streak chip into the Play page — the countdown is the load-bearing half. Do **not** fall back to a horizontally scrolling strip; that is the exact `.sc-tabs` bug being deleted.

**Thumb reach.** The game's tabs sit 58–102px from the top — a two-handed stretch on a 6.7". Accepted because the loop is *land-on-Play → act → leave*, not browse-between-tabs.

**The signal we picked wrong:** users tab-hopping repeatedly inside Spreadcast within one session. Then a top-anchored bar is the wrong control and the escalation is a contextual bottom bar. Everything else in this plan survives that change unmodified — it is a cheap thing to be wrong about.

---

## 7b. Bug found while working — not ours to fix, but it will bite

**`/spreadcast` hard-crashes when the game API is unavailable.** Reproduced locally: with no game backend configured, `/api/spreadcast/round` returns **502**, and `PlayView.tsx:353` then does `(state.open as { nextDay: string }).nextDay` on `undefined` → `TypeError` → the whole page white-screens with "This page couldn't load". There is no error boundary.

**[VERIFIED]** pre-existing — `PlayView.tsx` has an empty diff against `HEAD` (`d13c6a9`); nothing in Phase 0 touched it.

Why it matters: if the worker hiccups mid-demo, the game doesn't degrade — it takes the page down. Two candidate fixes, **both UI and both in scope**, but neither belongs in a token pass:

1. Guard the `state.open` access and render the existing "Between rounds" panel with a fallback string.
2. Add an `error.tsx` boundary under `src/app/spreadcast/` — natural to fold into Phase 2, which creates that layout anyway.

---

## 8. Open questions

- **[OPEN]** Surface ladder hexes (§3.5) — derived, not eyeballed on hardware.
- **[OPEN]** Type breakpoint 768px vs nav breakpoint 980px — recommend keeping both, documented.
- **[OPEN]** The full brand guidelines PDF (`https://docsend.com/view/quvyymw2ctm37f5n`) was not readable from here. It may specify spacing/logo clear-space/radius rules that override §3.2–3.3. **Worth 5 minutes to check before Phase 0.**
- **[OPEN]** Brand system is authored light-first (Paper = surface, Carbon = ink); the app is dark-mode. The DS bundle handles this with dark-as-default + `[data-theme="light"]`. Do we ever need the light flip, or is dark-only fine for the demo?

---

## 9. Handoff — backend items this plan deliberately does not do

Out of scope per §0. Listed so they aren't lost, and so nobody assumes the UI forgot them.

| Item | Why it's blocked | What UI does instead |
|---|---|---|
| **Auto-bind wallet on connect** — fire `/api/spreadcast/wallet` from a successful `connect()` | requires `src/lib/wallet.tsx` (connector) | one-tap "Link this wallet" row (§4) |
| **Live username validation** — 409-shaped response from `/api/spreadcast/join` to drive CHECKING / AVAILABLE / TAKEN | requires `api/` | plain field, error handled on submit (§5) |
| **Signature-verified wallet connect** — replace prototype r-address acceptance with a Xaman sign-in payload | requires `api/` + connector | nothing; already self-documented as prototype mode |
| **Magic-link email auth** | no backend exists | inline email field, no "check your inbox" screen (§5) |

None of these block Phases 0–2. The demo is coherent without them.

---

## Appendix A — verification commands

Run from `web/`:

```powershell
# accent drift: icon ships #42E7AA, --accent is #34d399
Select-String -Path src/app/icon.svg,public/brand/megawatt-symbol-green.svg -Pattern '#[0-9A-Fa-f]{6}'
Select-String -Path src/app/globals.css -Pattern '--accent:'

# 27 hardcoded emerald literals
(Select-String -Path src/app/globals.css,src/components/*.tsx,src/components/spreadcast/*.tsx `
  -Pattern 'rgba\(52, ?211, ?153' -AllMatches | ForEach-Object { $_.Matches }).Count

# 15 hardcoded zero-radius rules
(Select-String -Path src/app/globals.css -Pattern 'border-radius: ?0[;\s]').Count

# band "Steady" == primary action colour
Select-String -Path src/app/globals.css -Pattern '--sc-b\d'

# identity split: zero useWallet imports in the game
Select-String -Path src/components/spreadcast/*.tsx -Pattern 'useWallet'

# dead safe-area handling: no viewport export anywhere
Select-String -Path src/app/*.tsx,src/app/**/*.tsx -Pattern 'export const viewport'
```

## Appendix B — sources

| Source | What it gave us |
|---|---|
| `https://www.megawatt.solutions/brand/` | five-colour system, logo rules, font families |
| `…/brand/colors/colors.css` | canonical hex values |
| `…/brand/colors/tokens.json` | usage semantics + the ~2% green rule |
| `…/brand/megawatt-brand-kit.zip`, `logos/SVG/*` | full lockup set |
| Brand guidelines PDF — `docsend.com/view/quvyymw2ctm37f5n` | **not yet read** |
| Claude Design project `e8be95fe-2fbf-4800-9507-49de4ed23ce7` | `Spreadcast.dc.html` + DS token bundle (radius, spacing, type, motion) |
| This repo | drift measurements, identity split, layout tree |
