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

/** The memo a commit for `day`/`hash` must carry, in the hex the ledger
 * stores. Both the builder above and the check below read it from here, so
 * the thing we ask to be signed and the thing we accept cannot drift. */
export function commitMemoData(day: string, hash: string): string {
  return hex(`${day}:${hash}`);
}

/** True when a Xaman payload is *this* pick's commit: a Payment to the anchor
 * carrying this day's hash as its memo.
 *
 * Xaman only returns payloads this app created, so the payload is always one
 * of ours — the question is which one. Without this, any signed payload the
 * player could name stood in for any other: yesterday's commit, replayed
 * against today's uuid, marked today's pick locked on-chain while the only
 * transaction on the ledger committed to yesterday's forecast. The memo is
 * the commitment, so the memo is what decides.
 *
 * Read from Xaman's own parsed fields where it offers them, and from the
 * signed txjson for the memo. Deliberately silent about Amount and SourceTag:
 * they are what makes the commit cheap and attributable, not what makes it
 * true, and asserting fields Xaman may normalise would reject honest commits. */
export function isCommitPayload(
  payload: { tx_type: string; tx_destination: string; request_json: Record<string, unknown> },
  day: string,
  hash: string
): boolean {
  if (!ANCHOR_ADDRESS) return false;
  if (payload.tx_type !== "Payment") return false;
  if (payload.tx_destination !== ANCHOR_ADDRESS) return false;
  const memos = payload.request_json?.Memos;
  if (!Array.isArray(memos) || memos.length === 0) return false;
  const want = commitMemoData(day, hash);
  // Hex, where case carries no meaning.
  return memos.some((m) => {
    const memo = (m as { Memo?: Record<string, unknown> })?.Memo;
    return (
      String(memo?.MemoType ?? "").toUpperCase() === hex("spreadcast/commit") &&
      String(memo?.MemoData ?? "").toUpperCase() === want
    );
  });
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

// lookupCommitTx lived here: it said it verified a claimed commit "with the
// expected memo" and only asked the ledger whether the hash existed, which
// any transaction satisfies. Nothing called it. isCommitPayload above is the
// check it described, made before the hash is ever stored.

/** Sunday 15:00 local of the ISO week a day belongs to — when the weekly
 * anchor job runs. Exposed for the jobs route. */
export function anchorMomentFor(sunday: string): number {
  return localMomentUtc(sunday, OPEN_MIN);
}
