import { NextResponse } from "next/server";
import { findOrCreateUser, isRpcError } from "@/lib/spreadcast/store";
import { sessionToken, COOKIE } from "@/lib/spreadcast/session";
import { getPostHogClient } from "@/lib/posthog-server";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; name?: string } | null;
  try {
    const result = await findOrCreateUser(body?.email ?? "", body?.name ?? "");
    if (!result.user) return NextResponse.json({ error: result.error ?? "Join failed." }, { status: 400 });
    const user = result.user;
    const ph = getPostHogClient();
    if (ph) {
      ph.capture({
        distinctId: user.id,
        event: "spreadcast_joined",
        properties: { has_wallet: !!user.wallet, verified: user.verified },
      });
      ph.identify({ distinctId: user.id, properties: { name: user.name, verified: user.verified, has_wallet: !!user.wallet } });
      await ph.flush();
    }
    const res = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, verified: user.verified, wallet: user.wallet },
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
