import { NextResponse } from "next/server";
import { setPlayerName, isRpcError } from "@/lib/spreadcast/store";
import { sessionUserId } from "@/lib/spreadcast/session";

// Nickname chosen once after connecting — the only thing shown publicly.

export async function POST(req: Request) {
  const uid = await sessionUserId();
  if (!uid) return NextResponse.json({ error: "Connect your wallet first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? "").trim();
  if (name.length < 2 || name.length > 24) {
    return NextResponse.json({ error: "Nickname must be 2–24 characters." }, { status: 400 });
  }
  try {
    const result = await setPlayerName(uid, name);
    if (!result.user) return NextResponse.json({ error: result.error ?? "Could not save nickname." }, { status: 400 });
    const user = result.user;
    return NextResponse.json({ user: { id: user.id, name: user.name, wallet: user.wallet } });
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}
