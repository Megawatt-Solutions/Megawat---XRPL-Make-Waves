# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Megawatt BESS Vaults web app (`web/`). The project uses Next.js 16.2 with the App Router. PostHog is initialised client-side via `instrumentation-client.ts` (the recommended approach for Next.js 15.3+) and proxied through `/ingest` rewrites in `next.config.ts` to avoid ad-blocker interference. A singleton `posthog-node` client in `src/lib/posthog-server.ts` handles server-side event capture in the two Spreadcast API routes. User identification is wired to the XRPL wallet connect flow so every subsequent event is correlated to the wallet address.

| Event | Description | File |
|---|---|---|
| `wallet_connected` | User successfully connects their XRPL wallet via Xaman QR or watch-only address. | `web/src/lib/wallet.tsx` |
| `wallet_disconnected` | User explicitly disconnects their XRPL wallet. | `web/src/lib/wallet.tsx` |
| `wallet_connection_failed` | Wallet connection attempt fails with an error. | `web/src/lib/wallet.tsx` |
| `deposit_initiated` | User opens the deposit modal for a vault. | `web/src/components/VaultDetail.tsx` |
| `deposit_completed` | User confirms and completes a RLUSD deposit into a vault. | `web/src/components/VaultDetail.tsx` |
| `yield_claimed` | User claims their available yield from a vault. | `web/src/components/VaultDetail.tsx` |
| `marketplace_buy_clicked` | User clicks Buy on a marketplace listing. | `web/src/app/marketplace/page.tsx` |
| `marketplace_position_listed` | User lists a vault position for sale on the marketplace. | `web/src/app/marketplace/page.tsx` |
| `spreadcast_joined` | User joins the Spreadcast energy-price prediction game with their email (server-side). | `web/src/app/api/spreadcast/join/route.ts` |
| `spreadcast_prediction_submitted` | User submits a band prediction in the Spreadcast game (server-side). | `web/src/app/api/spreadcast/predict/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behaviour, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://eu.posthog.com/project/237112/dashboard/862403)
- [Vault deposit funnel (wizard)](https://eu.posthog.com/project/237112/insights/pM3zyV0i)
- [Wallet connections over time (wizard)](https://eu.posthog.com/project/237112/insights/qVjzn4yi)
- [Yield claimed over time (wizard)](https://eu.posthog.com/project/237112/insights/fklqZc6R)
- [Marketplace activity (wizard)](https://eu.posthog.com/project/237112/insights/pfKpLxU6)
- [Spreadcast engagement (wizard)](https://eu.posthog.com/project/237112/insights/g1aoHbHR)

## Verify before merging

- [ ] Run a full production build (`npm run build` inside `web/`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — currently identification fires on fresh wallet connect; a silent reconnect on page reload (the existing `useEffect` in `AppProviders`) does not re-identify. Add `posthog.identify(snap.address, { via, funded: snap.funded })` in the `adopt` callback so returning sessions are also identified.
- [ ] This project contains PostgreSQL data sources. Run `npx @posthog/wizard warehouse` to connect them to PostHog's data warehouse.

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-pages-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
