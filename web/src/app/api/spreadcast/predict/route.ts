import { NextResponse } from "next/server";
import { submitPrediction, attachCommitTx, getUser, isRpcError } from "@/lib/spreadcast/store";
import { sessionUserId } from "@/lib/spreadcast/session";
import { buildCommitTx } from "@/lib/spreadcast/xrplink";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Join with your email first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { band?: number; exact?: number | null } | null;
  if (body?.band == null) return NextResponse.json({ error: "Pick a band." }, { status: 400 });

  try {
    const result = await submitPrediction(uid, body.band, body.exact ?? null);
    if (!result.prediction) return NextResponse.json({ error: result.error ?? "Submit failed." }, { status: 400 });
    const user = await getUser(uid);
    const p = result.prediction;
    const ph = getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: uid,
        event: "spreadcast_prediction_submitted",
        properties: {
          day: p.day,
          band: p.band,
          has_exact: p.exact !== null,
          commit_tx_needed: result.commitTxNeeded ?? false,
          has_wallet: !!user?.wallet,
        },
      });
      await ph.flush();
    }
    return NextResponse.json({
      prediction: { day: p.day, band: p.band, exact: p.exact, hash: p.hash },
      // Verified players sign this 1-drop payment in Xaman — the daily
      // on-chain commitment.
      commitTx: result.commitTxNeeded && user?.wallet ? buildCommitTx(user.wallet, p.day, p.hash) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}

// Client reports a signed commit tx hash back (demo/simulated path only —
// the Xaman flow attaches the hash server-side in commit-sign).
export async function PUT(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Join first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { day?: string; txHash?: string } | null;
  if (!body?.day || !body?.txHash) return NextResponse.json({ error: "day and txHash required." }, { status: 400 });
  try {
    const ok = await attachCommitTx(uid, body.day, body.txHash);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No prediction found." }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}
