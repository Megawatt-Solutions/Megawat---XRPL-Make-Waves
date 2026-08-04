import { NextResponse } from "next/server";
import { submitPrediction, getUser, isRpcError } from "@/lib/spreadcast/store";
import { sessionUserId } from "@/lib/spreadcast/session";
import { buildCommitTx, ANCHOR_ADDRESS } from "@/lib/spreadcast/xrplink";
import { getPostHogClient } from "@/lib/posthog-server";

// A prediction only counts once its 1-drop commit Payment is signed, so the
// Xaman sign payload is created in the same response and the player signs
// immediately. Until commit-sign observes the hash on the payload, the pick
// stays pending (tx_hash null) and is excluded from scoring.

const KEY = process.env.XUMM_API_KEY;
const SECRET = process.env.XUMM_API_SECRET;

export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Connect your XRPL wallet first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { band?: number; exact?: number | null } | null;
  if (body?.band == null) return NextResponse.json({ error: "Pick a band." }, { status: 400 });
  if (!KEY || !SECRET) {
    return NextResponse.json(
      { error: "Xaman signing is not configured — predictions are disabled until it is." },
      { status: 503 }
    );
  }
  if (!ANCHOR_ADDRESS) {
    return NextResponse.json(
      { error: "Anchor account is not configured — predictions are disabled until it is." },
      { status: 503 }
    );
  }

  try {
    const user = await getUser(uid);
    if (!user) return NextResponse.json({ error: "Session expired — connect your wallet again." }, { status: 401 });
    if (!user.wallet) return NextResponse.json({ error: "Connect your XRPL wallet first." }, { status: 400 });
    // `code` so the client can reopen the nickname sheet without matching on
    // prose — this is the one 400 here that has a remedy the UI can offer.
    if (!user.name) {
      return NextResponse.json({ error: "Choose a nickname first.", code: "nickname_required" }, { status: 400 });
    }

    const result = await submitPrediction(uid, body.band, body.exact ?? null);
    if (!result.prediction) return NextResponse.json({ error: result.error ?? "Submit failed." }, { status: 400 });
    const p = result.prediction;

    const ph = getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: uid,
        event: "spreadcast_prediction_submitted",
        properties: { day: p.day, band: p.band, has_exact: p.exact !== null },
      });
      await ph.flush();
    }

    let sign;
    try {
      const { XummSdk } = await import("xumm-sdk");
      sign = await new XummSdk(KEY, SECRET).payload.create({
        txjson: buildCommitTx(user.wallet, p.day, p.hash) as unknown as Record<string, unknown> as never,
        options: { expire: 5 },
        custom_meta: { identifier: `commit-${p.day}-${uid}`.slice(0, 40), instruction: `Spreadcast daily commit for ${p.day}` },
      });
    } catch {
      sign = null;
    }
    if (!sign) {
      // The pick is stored as pending; commit-sign POST re-opens signing.
      return NextResponse.json(
        { error: "Prediction saved as pending, but Xaman could not be reached to open the sign request. It does not count until signed — retry signing in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      prediction: { day: p.day, band: p.band, exact: p.exact, hash: p.hash },
      sign: { uuid: sign.uuid, qrPng: sign.refs.qr_png, deeplink: sign.next.always },
    });
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}
