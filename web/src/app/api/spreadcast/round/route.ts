import { NextResponse } from "next/server";
import { roundState, isRpcError } from "@/lib/spreadcast/store";
import { sessionUserId } from "@/lib/spreadcast/session";
import { bandLabel, BAND_NAMES } from "@/lib/spreadcast/bands";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await sessionUserId();
  try {
    const s = await roundState(uid);
    return NextResponse.json({
      now: s.now,
      user: s.user ? { id: s.user.id, name: s.user.name, wallet: s.user.wallet } : null,
      open: s.open
        ? {
            day: s.open.day,
            closesAt: s.open.closesAt,
            boundaries: s.open.boundaries,
            bands: [0, 1, 2, 3, 4].map((i) => ({ i, name: BAND_NAMES[i], label: bandLabel(i, s.open!.boundaries) })),
            participants: s.open.participants ?? 0,
          }
        : { nextOpensAt: s.nextOpensAt, nextDay: s.nextDay },
      mine: s.mine ? { band: s.mine.band, exact: s.mine.exact, hash: s.mine.hash, txHash: s.mine.txHash } : null,
      latest: s.latest
        ? {
            day: s.latest.day,
            spread: s.latest.spread,
            outcomeBand: s.latest.outcomeBand,
            outcomeLabel: `${BAND_NAMES[s.latest.outcomeBand!]} · ${bandLabel(s.latest.outcomeBand!, s.latest.boundaries)}`,
            source: s.latest.source,
            hourly: s.latest.hourly,
            mine: s.myLatest
              ? { band: s.myLatest.band, correct: s.myLatest.correct, points: s.myLatest.points, streak: s.myLatest.streak }
              : null,
          }
        : null,
      boundaries: s.boundaries,
    });
  } catch (e) {
    return NextResponse.json({ error: isRpcError(e) ? e.message : "Game API unreachable." }, { status: 502 });
  }
}
