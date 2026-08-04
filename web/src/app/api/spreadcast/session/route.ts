import { NextResponse } from "next/server";
import { findOrCreatePlayerByWallet, isRpcError } from "@/lib/spreadcast/store";
import { sessionToken, COOKIE } from "@/lib/spreadcast/session";
import { getPostHogClient } from "@/lib/posthog-server";

// A player IS an r-address. The game session is created only from a Xaman
// SignIn payload this server fetches from Xaman itself — the account comes
// from Xaman's response, never from the request body, so a session cannot
// be forged by posting someone else's address.

const KEY = process.env.XUMM_API_KEY;
const SECRET = process.env.XUMM_API_SECRET;

export async function POST(req: Request) {
  if (!KEY || !SECRET) {
    return NextResponse.json(
      { error: "Xaman sign-in is not configured (XUMM_API_KEY / XUMM_API_SECRET). Sign-in is unavailable." },
      { status: 501 }
    );
  }
  const body = (await req.json().catch(() => null)) as { uuid?: string } | null;
  const uuid = body?.uuid ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  let account: string;
  try {
    const { XummSdk } = await import("xumm-sdk");
    const payload = await new XummSdk(KEY, SECRET).payload.get(uuid);
    if (!payload) return NextResponse.json({ error: "Unknown sign-in payload." }, { status: 404 });
    if (payload.payload.tx_type !== "SignIn") {
      return NextResponse.json({ error: "Not a sign-in payload." }, { status: 400 });
    }
    if (payload.meta.signed !== true || !payload.response.account) {
      return NextResponse.json({ error: "Sign-in was not completed in Xaman." }, { status: 400 });
    }
    account = payload.response.account;
  } catch {
    return NextResponse.json({ error: "Could not reach Xaman." }, { status: 502 });
  }

  try {
    const result = await findOrCreatePlayerByWallet(account);
    if (!result.user) return NextResponse.json({ error: result.error ?? "Sign-in failed." }, { status: 400 });
    const user = result.user;
    const ph = getPostHogClient();
    if (ph) {
      // Identified by the game player id — never the r-address (house rule).
      ph.identify({ distinctId: user.id, properties: { has_name: !!user.name } });
      ph.capture({ distinctId: user.id, event: "spreadcast_session_started", properties: { needs_name: !user.name } });
      await ph.flush();
    }
    const res = NextResponse.json({
      user: { id: user.id, name: user.name, wallet: user.wallet },
      needsName: !user.name,
    });
    res.cookies.set(COOKIE, sessionToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}
