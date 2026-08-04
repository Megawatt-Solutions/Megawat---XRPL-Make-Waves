import { NextResponse } from "next/server";
import { sessionUserId } from "@/lib/spreadcast/session";
import { getUser, getPrediction, attachCommitTx } from "@/lib/spreadcast/store";
import { localTime, openDeliveryDay } from "@/lib/spreadcast/time";
import { buildCommitTx, isCommitPayload, ANCHOR_ADDRESS } from "@/lib/spreadcast/xrplink";

// Real daily-commit signing via Xaman: POST re-opens a sign request for an
// existing pending prediction, wrapping the 1-drop Payment (anchor
// destination, Make Waves SourceTag, salted-hash memo) for the player's
// wallet; GET polls it and, once signed, attaches the on-ledger tx hash to
// the prediction server-side (we never trust a client-reported hash).
// Returns 501 when XUMM keys are absent — signing is simply unavailable
// then; there is no unsigned fallback.

const KEY = process.env.XUMM_API_KEY;
const SECRET = process.env.XUMM_API_SECRET;

async function sdk() {
  const { XummSdk } = await import("xumm-sdk");
  return new XummSdk(KEY!, SECRET!);
}

export async function POST() {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Connect your wallet first." }, { status: 401 });
  if (!KEY || !SECRET) {
    return NextResponse.json({ configured: false, error: "Xaman signing not configured." }, { status: 501 });
  }
  if (!ANCHOR_ADDRESS) {
    return NextResponse.json({ error: "Anchor account not configured." }, { status: 503 });
  }
  const user = await getUser(uid);
  if (!user?.wallet) {
    return NextResponse.json({ error: "Connect your XRPL wallet first." }, { status: 400 });
  }
  const day = openDeliveryDay(localTime());
  if (!day) return NextResponse.json({ error: "No round is open right now." }, { status: 400 });
  const prediction = await getPrediction(uid, day);
  if (!prediction) return NextResponse.json({ error: "Lock in a forecast first." }, { status: 400 });
  if (prediction.txHash && !prediction.txHash.startsWith("SIMULATED-")) {
    return NextResponse.json({ error: "Today's commit is already signed." }, { status: 409 });
  }
  try {
    const payload = await (await sdk()).payload.create({
      txjson: buildCommitTx(user.wallet, day, prediction.hash) as unknown as Record<string, unknown> as never,
      options: { expire: 5 },
      custom_meta: { identifier: `commit-${day}-${uid}`.slice(0, 40), instruction: `Spreadcast daily commit for ${day}` },
    });
    if (!payload) throw new Error("payload creation returned null");
    return NextResponse.json({ uuid: payload.uuid, qrPng: payload.refs.qr_png, deeplink: payload.next.always, day });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `Xaman error: ${e.message}` : "Could not reach Xaman." },
      { status: 502 }
    );
  }
}

export async function GET(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Connect your wallet first." }, { status: 401 });
  if (!KEY || !SECRET) return NextResponse.json({ error: "Xaman signing not configured." }, { status: 501 });
  if (!ANCHOR_ADDRESS) return NextResponse.json({ error: "Anchor account not configured." }, { status: 503 });
  const url = new URL(req.url);
  const uuid = url.searchParams.get("uuid") ?? "";
  const day = url.searchParams.get("day") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(uuid) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const user = await getUser(uid);
  if (!user?.wallet) return NextResponse.json({ error: "Connect your XRPL wallet first." }, { status: 400 });
  // Both uuid and day arrive from the client, so neither can be taken as
  // saying anything about the other. The pick names the hash the payload has
  // to carry.
  const prediction = await getPrediction(uid, day);
  if (!prediction) return NextResponse.json({ error: "No forecast for that day." }, { status: 400 });
  try {
    const payload = await (await sdk()).payload.get(uuid);
    if (!payload) return NextResponse.json({ error: "Unknown payload." }, { status: 404 });
    if (!isCommitPayload(payload.payload, day, prediction.hash)) {
      return NextResponse.json({ error: "That sign request is not this day's commit." }, { status: 400 });
    }
    const txid = payload.response.txid ?? null;
    if (payload.meta.signed && txid) {
      // The commit has to be signed by the wallet the player is, not merely by
      // a wallet: Xaman resolves who actually signed, and that is the account
      // the ledger will show as having made the commitment.
      if (payload.response.account !== user.wallet) {
        return NextResponse.json({ error: "That commit was signed by a different account." }, { status: 400 });
      }
      // Deliberately not gated on the round still being open. A signature
      // given at 14:59 can be observed at 15:00, and the transaction carries
      // its own ledger time; refusing it here would throw away an honest
      // commit to close a window the 5-minute payload expiry already closes.
      await attachCommitTx(uid, day, txid); // server-observed hash, not client-claimed
    }
    return NextResponse.json({
      opened: payload.meta.app_opened,
      signed: payload.meta.signed,
      cancelled: payload.meta.cancelled,
      expired: payload.meta.expired,
      txHash: payload.meta.signed ? txid : null,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Xaman." }, { status: 502 });
  }
}
