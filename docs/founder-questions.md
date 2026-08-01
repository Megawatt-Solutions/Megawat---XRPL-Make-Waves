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
