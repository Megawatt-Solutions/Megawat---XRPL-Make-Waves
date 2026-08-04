// ── Sessions ─────────────────────────────────────────────────────
// A session exists only after a server-verified Xaman sign-in: the session
// route sets a signed HttpOnly cookie carrying just the player id.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.SESSION_SECRET || "spreadcast-dev-secret-not-for-prod";
export const COOKIE = "sc_session";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function sessionToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expect = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string }).uid;
  } catch {
    return null;
  }
}

export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return parseToken(jar.get(COOKIE)?.value);
}
