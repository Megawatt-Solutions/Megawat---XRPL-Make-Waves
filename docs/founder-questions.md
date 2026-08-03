# Open questions for the founders

Things measured, deliberately not changed, because the answer is a product decision rather than a design one.

## Portfolio value adds two currencies

`portfolioMetrics()` in `src/lib/portfolio.ts` computes:

    currentValue: totalDeposited + totalClaimable

`types.ts` declares `deposited` as principal in **RLUSD** and `claimable` as
"claimable yield (**vault currency**)" — EUR for every site currently in the
book. So this line adds dollars to euros, and the Portfolio value card renders
the result with a "$".

**Inert today**: `POSITIONS` is `[]`, so every term is 0. It starts producing a
wrong number the moment the first deposit lands. `lifetimeYield = claimable +
claimed` is fine — both are vault currency.

Left alone because fixing it means either a conversion (needs a rate source) or
a decision that yield is paid in RLUSD after all — both product calls, and both
outside "design only". Same class as `others = raised - deposited` in
VaultDetail, already noted.

## In which asset is depositor yield actually paid?

The code answers this two ways. The type says vault currency; two call sites in
VaultDetail hardcoded "USD". I made the two outliers match the other five and
the type declaration — a consistency fix, not a decision — so the app no longer
contradicts itself. But the underlying question is still open, and it is worth
answering explicitly before deposits open: a depositor sends RLUSD and, as the
UI now reads, accrues yield denominated in EUR. If that is right, the deposit
flow should say so. If yield is in fact paid in RLUSD, then `types.ts` is wrong
and five call sites move, not two.

## The profile sheet asserts an accreditation for any address that connects

`buildProfile()` in `src/lib/wallet.tsx` sets `kycLevel: 2` unconditionally,
together with `kycIssuer: "Megawatt Compliance · XRPL Credentials (XLS-70)"` and
`kycIssuedAt: "2026-07-10"`. `WalletModal` renders that as the most prominent
element in the sheet: a green card with a verified check, **"Accredited
Investor"**, the issuer and date, and an **ELIGIBLE** badge, plus an
"Accreditation — Full (Tier 2)" row below.

Measured on three addresses connected watch-only, two of which are real funded
mainnet accounts belonging to other people:

| address | accredited | badge | tier |
|---|---|---|---|
| rrrrrrrr…hoLvTp (black hole, unfunded) | yes | ELIGIBLE | Full (Tier 2) |
| rHb9CJAW…wdtyTh (funded) | yes | ELIGIBLE | Full (Tier 2) |
| rPT1Sjq2…zbpAYe (funded) | yes | ELIGIBLE | Full (Tier 2) |

The sheet also contradicts itself within about 60px: the line above the card
reads "watch-only · unfunded (1 XRP base reserve)" — an account that has never
transacted — and the card under it says the holder is an accredited investor
credentialed in July 2026.

The code knows it is a placeholder: `src/lib/user.ts` is commented "Credentials
(XLS-70) once the compliance flow goes live". Only the UI does not say so.

**Not changed, deliberately.** The data comes from `wallet.tsx`, which is out of
scope for me to modify, and *how* to present accreditation is a legal and
product decision rather than a design one. Flagging it because it is different
in kind from the other placeholders in this file: the hardcoded "All systems
operational" ribbon is a claim about infrastructure, whereas this is a
regulatory claim about a specific identified user, attributed to a named issuer
with an issue date.

If you want it softened without touching the connector, the presentation is
entirely in `src/components/WalletModal.tsx` (`accredited` is derived at line 18
from `profile.kycLevel`), so a "pending verification" treatment is a small,
self-contained change there — say the word and I will make it.

### One extra fact, found while reading the sheet

The sheet was opened with a **watch-only** connection, which is an address the
visitor pasted rather than one they proved they control. It still showed:

    Accredited Investor
    Megawatt Compliance · XRPL Credentials (XLS-70) · Jul 2026
    ELIGIBLE
    Accreditation    Full (Tier 2)

The status line four lines above it correctly reads `XRPL · Mainnet ·
watch-only`, so the component already knows. `profile.via` is used on line 66
to choose between "Xaman sign-in" and "watch-only", and the accreditation block
below simply does not consult it.

That makes the claim narrower and more specific than the one above: whatever
you decide about the placeholder badge in general, asserting a regulatory
status for an address whose ownership has not been demonstrated is a different
thing again. Anyone can paste anyone's address.

It also makes the fix cheap whichever way you go, because the flag is already
in hand:

- gate the whole accreditation block on `profile.via === "xaman"`, or
- keep it and qualify it, e.g. "Accreditation shown for the connected address;
  ownership not verified in watch-only mode".

Still not changed, for the same reason as above and one more: it sits inside
the decision you have not made yet, so choosing for you here would be choosing
the general question by way of a special case.

## The audit suite is ready for CI, but wiring it is your call

`npm run audit` runs all five audits, `audit:canary` proves each check can still
fail, and `audit:deep` covers the connected, landscape, tab-order and
reduced-motion modes. All three exit non-zero on failure, verified against a
dead server.

There is no CI in this repo — no `.github/workflows`, no `vercel.json`. Adding a
workflow that runs on every push affects your merge process and your Actions
budget, so I have not created one. If you want it, it is roughly:

    - run: npm ci
    - run: npm run build
    - run: npx next start -p 3100 &
    - run: npx wait-on http://localhost:3100
    - run: npm run audit:all

The audits need a running server on port 3100 and a Chrome binary; they find one
via `CHROME_PATH` or the usual install locations.

## "Total value locked" is your operating assets, not deposits

`dashboard-v2` leads with:

    TOTAL VALUE LOCKED
    €2.44M
    2 operational sites · €37.0K replacement fund

That figure is `OPERATIONAL_VALUE` in `src/lib/protocol.ts`:

```ts
export const OPERATIONAL_VALUE =
  VAULTS.filter((v) => v.kind === "showcase").reduce((s, v) => s + v.capex, 0);
```

— the combined capex of Ljubljana (€240K) and Metlika (€2.2M). Both are
showcase sites: off-chain, not investable, and every card that shows one says
"Showcase site · not investable". Depositor capital in the protocol is €0, and
will be until the pipeline opens.

The arithmetic is right and the subtitle is honest about scope. The question is
the label. In this market "TVL" is a term of art for **capital third parties
have placed in the protocol**, and it is the first number an institutional
reader will look for. Ours currently means "book value of the batteries we
operate", which is a genuinely impressive but different claim.

Three ways forward, all small, none of them mine to pick:

1. **Rename the tile** — "Operating assets" or "Assets under management" says
   what the number is, and nobody has to interpret it.
2. **Keep TVL and change what it counts** — depositor principal, which is €0
   today and grows when the raise opens. Honest, and an empty headline metric
   on a launch dashboard is a real cost.
3. **Show both** — "Operating assets €2.44M" beside "Deposits €0", which is the
   fullest picture and the most work.

I have not changed it, because it is a positioning decision rather than a
design one, and it is adjacent to `apyBps` and `currentValue` already in this
file. Say which and it is a few lines.

Everything else on that page checked out: the odometer hides its digit reels
from assistive tech and exposes the real figure to it, the view tabs use
`aria-pressed` in a labelled group and honour exactly the keyboard contract
that pattern implies, and the figures cohere — cumulative yield €328,793
against Ljubljana + Metlika annual revenue of €324.3K is about one year, and
13.5% of €2.44M matches the projected APY beside it.

---

## The header drops the "XRPL MAINNET" chip when the bar runs out of room

This one is already shipped rather than pending, because leaving it as it was
meant leaving something visibly wrong on screen. Flagging it because it changes
what a visitor sees, and that is your call to reverse.

The header carries the wordmark, five navigation links, the chain chip and
Connect Wallet. Measured, that is more than fits from **125% text zoom upward at
every desktop width, including 1920** — the links were running up to 300px past
their container and painting under the chip and the button. The bar now sheds,
cheapest thing first, and the chip is the cheapest: it is a static indicator on
a single-chain app, not a control.

So, by available width at the reader's text size:

| | wordmark | nav labels | chip | button |
|---|---|---|---|---|
| roomy | MEGAWATT | words | XRPL MAINNET | CONNECT WALLET |
| tight | MEGAWATT | words | XRPL | CONNECT WALLET |
| tighter | mark only | words | — | CONNECT |
| tightest | mark only | icons | — | CONNECT |

Phones get the "tighter" treatment at normal text, because a 375px bar has 12px
of slack and there is no room for the chip at all.

**What is not lost:** every shed element keeps an `sr-only` label, so a screen
reader still announces "XRPL Mainnet" and "Megawatt" at every size, and all five
destinations keep their full names. Tabbing the most compact bar still gives
skip link, MEGAWATT, OVERVIEW, VAULTS, SPREADCAST, PORTFOLIO, MARKETPLACE,
CONNECT.

**What is lost:** a sighted reader at 125% zoom or on a phone no longer sees the
word "MAINNET" in the header. Network is still stated in the wallet modal and in
the connected pill's own copy.

**The question for you:** is the network indicator load-bearing for trust with
an institutional audience — the kind of thing someone looks for before
connecting a wallet — or is it decoration on a product that only ever talks to
one chain? If it is the former, the honest fix is to make room for it by moving
something else out of the bar rather than by shrinking type, and the candidate
is the five-link row: a product with five top-level destinations and a persistent
account control is asking a 58px bar to do a lot.

One thing deliberately **not** done, and worth knowing why: shrinking the chip to
its mark alone. The XRPL mark is a stylised X on a dark roundel, and at 16px
beside a green Connect button it reads as a close button — wrong, and alarming
next to the primary account control. It either keeps a word or it goes.
