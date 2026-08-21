# Megawatt ⚡ — Interface

Tokenized **Battery Energy Storage System (BESS)** investment platform on the
**XRP Ledger**. Investors deposit RLUSD into vaults backed by physical battery
farms, receive a tradeable **receipt token (XRPL MPT)**, earn yield, and trade
their positions on a secondary marketplace. This branch (`xrpl`) pivots the
app to **XRPL mainnet**: live wallet connect + account reads today, vault
tokenization next; it also adds **Spreadcast** (`/spreadcast`), the free
day-ahead forecasting game built for the XRPL Make Waves cohort.

> Successor to the Paris hackathon prototype — rebuilt dark-mode, with a proper
> ERC-4626 vault standard and an ERC-7540-style async redemption layer.

## Architecture decisions

- **Vaults — ERC-4626 + async redeem.** Depositing stablecoins mints 4626 shares
  **1:1**; those shares _are_ the transferable **yield-receipt token** and the
  asset traded on the marketplace. Yield is distributed separately and is
  **claimable** (matches the product UI), accounted per-share so the token trades
  cleanly. Once a vault is funded it goes Active and capital is **drawn down** to
  fund the physical BESS; principal redemption is **async (ERC-7540 style)** to
  model the locked real-world capital. Deposits are **KYC-gated**.
- **Yield verification.** Operator-driven distribution for v1; ZK-verified
  (Groth16) distribution is a fast-follow, reusing the existing Circom circuit.
- **Two off-chain showcase vaults** (Ljubljana, Metlika) mirror our real,
  operational BESS sites — rich dashboards, no wallet/deposit.

## Structure

```
megawatt-interface/
├── web/          # Next.js 16 frontend (dark mode) — the app
├── contracts/    # Foundry: vaults (4626/7540-style), MockUSDC, KYC oracle, marketplace
├── simulator/    # BESS data simulator (added next)
├── .env.example  # env template — copy to .env, never commit the real one
└── README.md
```

## Pages

- **Dashboard** — TVL, replacement fund, vault count, total MW; active + fundraising vaults.
- **Vault detail** — live BESS metrics, yield breakdown, deposit/claim, your position.
- **Portfolio** — deposited / claimable / claimed / avg APY, principal+interest growth, positions.
- **Marketplace** — list & buy positions (receipt-token shares), premium over face value.

## Network

| | |
|---|---|
| Chain | XRP Ledger — Mainnet |
| Endpoints | `wss://xrplcluster.com` (fallback `s1`/`s2.ripple.com`) |
| Explorer | `https://livenet.xrpl.org` |
| Settlement | RLUSD (`rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`) |

## Stream Vault demo (Base Sepolia)

On-chain demo of the **Stream Vault** mechanism at `/stream`: pre-deposit
escrow (T-bill parked, yield to depositors), RTB-gated conversion to
vintage-tagged ERC-1155 units at a **PV-parity mint**, milestone drawdowns
(engineer cert → 2-of-3 confirm → timelock → fixed SPV destination), monthly
revenue sweeps into a segregated reserve compartment, a mechanical NAV oracle,
and FIFO redemption epochs at a forward-priced spread. **Demo only — not
audited, simulated assets, compressed clock (1 month = 10 minutes).**

| Contract | Address (Base Sepolia, chain 84532) |
|---|---|
| MockUSD `dUSD` (faucet, 6dp) | `0x4232353b04a62547eAB29217332e1340c917e852` |
| MockTBill `dTBILL` (ERC-4626, 5% APR) | `0x4851abE7Ae1dc3c20108540f86a14c5B5f1FA2e0` |
| StreamVault (ERC-1155 vintages) | `0x2DAf9D7BeE23e65344431850Ce28b54C63244faD` |
| NAVOracle | `0xdb649C2086595CD798d7dEB9974634C9f3b5A44C` |

Verified on [Blockscout](https://base-sepolia.blockscout.com/address/0x2DAf9D7BeE23e65344431850Ce28b54C63244faD?tab=contract).
Addresses land in `contracts/deployments/base-sepolia-stream.json`, which the
frontend imports directly.

Deploy a fresh instance (also re-seeds both tranches and rewrites the JSON):

```bash
cd contracts && set -a && source .env && set +a && forge script script/DeployStreamDemo.s.sol --rpc-url https://sepolia.base.org --broadcast --verify --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/ --private-key "$PRIVATE_KEY"
```

Tests (`forge test`): full lifecycle, refund path, drawdown safety gauntlet,
PV-parity mint, forward-pricing spread, and a fuzz **invariant proving the
escrow and reserve compartments never cross**.

### The 10-minute stage demo

All roles sit on the deployer wallet by default (set `AGENT_ADDRESS` /
`ENGINEER_ADDRESS` at deploy for a real 3-wallet multisig demo). Only MetaMask
is needed; the header links a Base Sepolia ETH faucet for gas.

1. Open `/stream`, **Connect MetaMask** (auto-adds Base Sepolia), hit the
   **dUSD faucet** (10,000 dUSD/hour) — or use the pre-funded deployer wallet.
2. **Tranches** → *BESS Alba* → **Deposit dUSD**. Watch the escrow card on
   Overview: principal parked in T-bills, accrued yield ticking.
3. At ≥ 90% subscription: **Convert at NTP** (Megawatt role). First vintage
   mints `refMWhTotal` units — 1 unit ≙ 1 reference MWh; the oracle sets the
   ratio, nobody types it.
4. **Drawdown console**: post a milestone cert (memo hashed client-side),
   queue a drawdown, confirm as two roles, let the 120s timelock run,
   **Execute → SPV**. Funds can only reach the tranche's fixed SPV account.
5. **Sweep feed** → **Simulate month** ×3 (gross randomised ±20% around
   reference). Watch the NAV chart climb on Overview and the performance
   factor mark PV up/down.
6. **Redeem**: request units, show deposit NAV vs redeem NAV (the 50 bps
   forward-pricing spread), **Close epoch & pay queue** — FIFO, capped at 20%
   of reserves per epoch.
7. Later: convert *BESS Beta* while Alba streams to show the **PV-parity
   mint** leaving Alba's NAV per unit untouched; after 18 sweeps,
   **Expire vintage** and redeem at terminal (pure-cash) NAV.

## Legacy: Arbitrum Sepolia deployment (main branch, 2026-07-10)

The Solidity contracts below remain live on Arbitrum Sepolia from the
Arbitrum/Robinhood hacker house build and are no longer wired into the app
on this branch.

| Contract | Address |
|---|---|
| MockUSDC (faucet, 6dp) | `0x4232353b04a62547eAB29217332e1340c917e852` |
| CredentialOracle (open mode) | `0x4851abE7Ae1dc3c20108540f86a14c5B5f1FA2e0` |
| Marketplace | `0x9f3F62dD3dE0aD5bea5bfbf4dCd49576Fc12b249` |
| Vault — Zagreb 01 `mwZAG01` (fundraising) | `0x2DAf9D7BeE23e65344431850Ce28b54C63244faD` |
| Vault — Trieste 01 `mwTRS01` (fundraising) | `0xdb649C2086595CD798d7dEB9974634C9f3b5A44C` |
| Vault — Belgrade 01 `mwBEL01` (pipeline) | `0xb678D9fb980F787c307BAFa617cc8d0048b8a89F` |

Deploy: `cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url arbitrum_sepolia --broadcast`
(reads `PRIVATE_KEY`/`RPC_URL` from gitignored `contracts/.env`). Tests: `forge test`.

## Develop

```bash
cd web
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # http://localhost:3000
```
