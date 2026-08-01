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
