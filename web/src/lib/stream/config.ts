// Stream Vault demo — chain + contract wiring (Base Sepolia).
// Addresses come straight from the deploy script's JSON artifact so the
// frontend and the chain can never disagree: contracts/deployments/*.json is
// the single source of truth.
import deployments from "../../../../contracts/deployments/base-sepolia-stream.json";

export const STREAM_CHAIN = {
  id: 84532,
  hexId: "0x14a34",
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  // Coinbase developer faucet for Base Sepolia ETH (gas).
  faucet: "https://portal.cdp.coinbase.com/products/faucet",
} as const;

export const ADDRESSES = {
  mockUsd: deployments.mockUsd as string,
  mockTBill: deployments.mockTBill as string,
  streamVault: deployments.streamVault as string,
  navOracle: deployments.navOracle as string,
  deployer: deployments.deployer as string,
} as const;

export const DEPLOY_BLOCK: number = deployments.deployBlock;
export const SECONDS_PER_MONTH: number = deployments.secondsPerMonth;

export const TRANCHE_STATES = ["Pre-deposit", "Streaming", "Expired", "Refunded"] as const;

/** Demo-wide banner copy — required on every screen. */
export const DEMO_BANNER = `Demo on Base Sepolia — simulated assets, compressed timeline (1 month = ${
  SECONDS_PER_MONTH === 600 ? "10 minutes" : `${SECONDS_PER_MONTH} seconds`
}).`;
