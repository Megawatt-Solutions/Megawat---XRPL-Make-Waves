import { NextResponse } from "next/server";

// Xaman (XUMM) sign-in. POST creates a SignIn payload → the client renders
// the QR / deep link; GET polls the payload until the user signs in the
// Xaman app, which proves ownership of the r-address (unlike the watch-only
// fallback). Requires XUMM_API_KEY / XUMM_API_SECRET (free at apps.xumm.dev);
// without them POST returns 501 and the client falls back to watch-only.

const KEY = process.env.XUMM_API_KEY;
const SECRET = process.env.XUMM_API_SECRET;

async function sdk() {
  const { XummSdk } = await import("xumm-sdk");
  return new XummSdk(KEY!, SECRET!);
}

export async function POST() {
  if (!KEY || !SECRET) {
    return NextResponse.json(
      { configured: false, error: "Xaman sign-in is not configured on this deployment yet." },
      { status: 501 }
    );
  }
  try {
    const payload = await (await sdk()).payload.create({
      txjson: { TransactionType: "SignIn" },
      options: { expire: 5 }, // minutes
    });
    if (!payload) throw new Error("payload creation returned null");
    return NextResponse.json({
      uuid: payload.uuid,
      qrPng: payload.refs.qr_png,
      deeplink: payload.next.always,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Xaman - try again in a moment." }, { status: 502 });
  }
}

export async function GET(req: Request) {
  if (!KEY || !SECRET) return NextResponse.json({ error: "Not configured." }, { status: 501 });
  const uuid = new URL(req.url).searchParams.get("uuid") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return NextResponse.json({ error: "Bad payload id." }, { status: 400 });
  try {
    const payload = await (await sdk()).payload.get(uuid);
    if (!payload) return NextResponse.json({ error: "Unknown payload." }, { status: 404 });
    return NextResponse.json({
      opened: payload.meta.app_opened,
      resolved: payload.meta.resolved,
      signed: payload.meta.signed,
      cancelled: payload.meta.cancelled,
      expired: payload.meta.expired,
      account: payload.response.account ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Xaman." }, { status: 502 });
  }
}
