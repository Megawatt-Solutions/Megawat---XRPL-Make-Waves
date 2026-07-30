# Onboarding flow

First-run overlay that explains what Megawatt is before asking anything of the user.

**Files:** `web/src/lib/onboarding.ts` (content + state) · `web/src/components/Onboarding.tsx` (presentation) · `.ob-*` block in `web/src/app/globals.css`
**Mounted:** last child of `<AppProviders>` in `web/src/app/layout.tsx`
**Last updated:** 2026-07-30

---

## Why it looks like this

The brief was "a few onboarding screens where they're prompted to connect the wallet." The research says do most of that, but not the last part.

| Finding | What it changed |
|---|---|
| Linear upfront onboarding completes **~53%**; contextual/progressive **~75%**, with ~30% better paid conversion | Four screens, not eight. The app teaches the rest in context. |
| Show value before requiring sign-up | Nothing is asked until screen 4, and even then it's optional. |
| In web3, the wallet-connect gate is the top drop-off — roughly **68%** abandon between connecting and first action | **The wallet step offers, it does not require.** |

So on the last screen the accent primary button is **"Explore first"**, and *"Connect a wallet"* sits above it as a quieter outline button. You keep the explanation without buying the drop-off. Farcaster's onboarding is the reference: let people look around first, so by the time they connect they're already invested.

Sources: [Digia](https://www.digia.tech/post/onboarding-patterns-progressive-disclosure-vs-front-loaded-setup) · [lowcode.agency](https://www.lowcode.agency/blog/mobile-onboarding-best-practices) · [DEV — Web3 onboarding is a trust problem](https://dev.to/somaryuu/web3-onboarding-is-not-a-wallet-problem-it-is-a-trust-problem-48p1) · [NN/g — Mobile-app onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/)

---

## The four screens

| # | id | Question it answers |
|---|---|---|
| 1 | `what` | What is this? Grid batteries, onchain — and they're already running |
| 2 | `where` | Where do I find things? Vaults / Portfolio / Marketplace / Spreadcast |
| 3 | `spreadcast` | What's the game? Call tomorrow's spread — the number the batteries earn on |
| 4 | `wallet` | Do I need a wallet? No. Only to deposit or join the verified leaderboard |

Screen 3 is doing the real work: it ties the game back to screen 1, so Spreadcast reads as *the same product* rather than a side attraction.

---

## Turning it on and off

Everything is in `src/lib/onboarding.ts`:

```ts
export const ONBOARDING_ENABLED = true;      // master switch
export const ONBOARDING_ON_DESKTOP = true;   // sheet on phones, dialog on desktop
export const ONBOARDING_VERSION = 1;         // bump to re-show to everyone
```

Per-step: add `enabled: false` to any entry in `STEPS`. The component reads `activeSteps()`, so a disabled step disappears from the flow *and* from the progress dots with no other change.

**The first experiment to run** is `where: { enabled: false }` — its content is a nav map that the bottom tab bar already communicates. Three screens is where the research actually points; four is the top of what it supports.

⚠ **Bumping `ONBOARDING_VERSION` re-shows the flow to your entire existing user base.** That's the intended mechanism for a copy rewrite. Don't do it casually.

---

## QA

| URL | Effect |
|---|---|
| `?onboarding=reset` | Clears progress, opens at screen 1, then **strips itself from the URL** so a reload or a shared link doesn't wipe progress again |
| `?onboarding=1` | Force-opens without clearing progress. Param persists, so reload re-opens — handy for iterating on copy |
| `?onboarding=0` | Suppressed. Put this on the base URL of e2e tests so the overlay never intercepts a selector |

Works on any route: `http://localhost:3000/spreadcast?onboarding=reset`.

**Storage:** `mw.onboarding.v1` → `{"done":boolean,"step":number}`

**DOM hooks:** `[data-testid="onboarding"]`, `-next`, `-back`, `-skip`, `-wallet`; `.ob-sheet[data-step]` carries the step id, `[data-index]` the position, `[data-dir]` the last direction.

---

## Implementation notes

Things that are load-bearing and easy to break:

**No flash, no hydration mismatch.** `open` is `boolean | null` and starts `null`, which renders nothing. Server render and first client render are therefore identical, and the localStorage read happens in an effect afterwards. Do **not** "fix" this by reading storage in a `useState` initialiser — that crashes SSR and reintroduces the mismatch.

**The wallet step is filtered reactively.** `wallet.tsx` reconnects a stored address through an async account fetch, so `connected` is `false` on first paint even for a returning connected user. Filtering once at mount would show the wallet step to everybody. Verified: with a stored address the flow renders **3 dots**, without it **4**.

**Not a native `<dialog>`.** Every current accessibility guide recommends `showModal()`, and it is wrong here: it renders in the browser *top layer*, above every `z-index`, which would put the app's own `XrplConnectModal` (a plain `.overlay` at `z-index: 1000`) *behind* the onboarding sheet and make it unreachable. The overlay sits at `z-index: 900` on purpose — above `.nav` (50) and `.bottom-nav` (60), below `.overlay` (1000) and `.toasts` (2000).

**Focus.** Initial focus goes to the *container*, not the first button — the first focusable is Skip, and announcing "Skip, button" as the user's first impression is wrong. The container carries `role="dialog"` + `aria-labelledby`/`aria-describedby`, so AT reads the title and lede instead. Focus is trapped (Tab wrap + a `focusin` guard) and restored on close.

**The scroll container is stable; only the inner step remounts.** If `.ob-body` were keyed it would drop focus and reset its tab stop on every step change. `.ob-foot` is outside the keyed element too, so focus stays on the primary CTA and the whole flow can be walked with repeated Enter presses.

**Progress is announced, not implied.** The dot row is `aria-hidden` (four unlabelled dots announce as nothing useful); a visually-hidden `role="status"` region says "Step 2 of 4: …" instead.

---

## Known gaps

- **Android hardware back doesn't close the overlay** — it navigates the page behind it. Fixable with `history.pushState` on open + a `popstate` listener, at the cost of a spurious history entry.
- **Dismiss is permanent.** Escape or a mis-tapped Skip marks it done forever. `?onboarding=reset` recovers it, but a `dismissed` flag distinct from `done` would let you re-offer once on a later session without re-nagging.
- **No analytics wired in.** PostHog is a dependency now; `onboarding_step_viewed {step_id, index, total}` plus `onboarding_completed` / `onboarding_skipped` is what would let you measure this flow against the 53%/75% benchmark rather than inheriting it on faith. Deliberately not added — see the PII caveat in [`ai-development-guidelines.md`](./ai-development-guidelines.md) §5 before enabling any analytics.
- **Copy says "11:45 CET"**, but `lib/spreadcast/time.ts` uses `Europe/Ljubljana` — which is CEST from late March to late October. The same error is in `HowView.tsx`. Suggest "11:45 Ljubljana time" in both: a game whose premise is *"your pick is committed before the result exists"* shouldn't be loose about its deadline.
