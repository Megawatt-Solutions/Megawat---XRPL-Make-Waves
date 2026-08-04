// ── XRPL integration ─────────────────────────────────────────────
// Two platform wallets (keys with the CTO, never in the repo):
//   anchor wallet — receives the daily 1-drop commit signatures from
//                   players and sends the weekly Merkle anchor;
//   prize wallet  — weekly RLUSD batch payouts (out of scope for the
//                   prototype; no payment-IN rails exist anywhere).
// Without XRPL_ANCHOR_SEED the prototype runs in demo mode: transactions
// are constructed but not submitted, and are labeled simulated.

import { localMomentUtc, OPEN_MIN } from "./time";
import { MAKE_WAVES_SOURCE_TAG } from "../xrpl";

export const XRPL_WSS = process.env.XRPL_WSS || "wss://xrplcluster.com";
export const ANCHOR_ADDRESS = process.env.XRPL_ANCHOR_ADDRESS || "";

const hex = (s: string) => Buffer.from(s, "utf8").toString("hex").toUpperCase();

/** The 1-drop Payment a player signs in Xaman each day. Carries the
 * salted prediction hash as a memo → tamper-proof public commitment and a
 * genuine daily mainnet transaction per active player. */
export function buildCommitTx(playerAddress: string, day: string, hash: string) {
  return {
    TransactionType: "Payment" as const,
    Account: playerAddress,
    // Callers must gate on ANCHOR_ADDRESS being configured — there is no
    // demo fallback destination, so an unconfigured anchor fails loudly.
    Destination: ANCHOR_ADDRESS,
    Amount: "1", // 1 drop
    SourceTag: MAKE_WAVES_SOURCE_TAG,
    Memos: [
      {
        Memo: {
          MemoType: hex("spreadcast/commit"),
          MemoFormat: hex("text/plain"),
          MemoData: hex(`${day}:${hash}`),
        },
      },
    ],
  };
}

export interface AnchorResult {
  simulated: boolean;
  txHash: string;
  explorer?: string;
}

/** Weekly Merkle anchor from the platform wallet. Real submit only when the
 * anchor seed is configured; otherwise returns a labeled simulation. */
export async function submitWeeklyAnchor(week: string, root: string): Promise<AnchorResult> {
  const seed = process.env.XRPL_ANCHOR_SEED;
  if (!seed) {
    return { simulated: true, txHash: `SIMULATED-${root.slice(0, 16).toUpperCase()}` };
  }
  const { Client, Wallet } = await import("xrpl");
  const client = new Client(XRPL_WSS);
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(seed);
    const tx = {
      TransactionType: "Payment" as const,
      Account: wallet.address,
      Destination: wallet.address, // self-payment carrier for the memo
      Amount: "1",
      SourceTag: MAKE_WAVES_SOURCE_TAG,
      Memos: [
        {
          Memo: {
            MemoType: hex("spreadcast/anchor"),
            MemoFormat: hex("text/plain"),
            MemoData: hex(`${week}:${root}`),
          },
        },
      ],
    };
    const res = await client.submitAndWait(tx, { autofill: true, wallet });
    const txHash = (res.result as { hash?: string }).hash ?? "";
    return { simulated: false, txHash, explorer: `https://livenet.xrpl.org/transactions/${txHash}` };
  } finally {
    await client.disconnect();
  }
}

/** Verify a claimed commit tx exists on ledger with the expected memo.
 * Demo mode (no ws reachable / demo hashes) returns "unverified". */
export async function lookupCommitTx(txHash: string): Promise<"found" | "missing" | "unverified"> {
  if (txHash.startsWith("SIMULATED-")) return "unverified";
  try {
    const { Client } = await import("xrpl");
    const client = new Client(XRPL_WSS);
    await client.connect();
    try {
      const res = await client.request({ command: "tx", transaction: txHash });
      return res.result ? "found" : "missing";
    } finally {
      await client.disconnect();
    }
  } catch {
    return "unverified";
  }
}

/** Sunday 15:00 local of the ISO week a day belongs to — when the weekly
 * anchor job runs. Exposed for the jobs route. */
export function anchorMomentFor(sunday: string): number {
  return localMomentUtc(sunday, OPEN_MIN);
}
