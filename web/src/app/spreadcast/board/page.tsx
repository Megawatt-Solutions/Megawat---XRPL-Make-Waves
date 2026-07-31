import type { Metadata } from "next";

import { LeaderboardView } from "@/components/spreadcast/LeaderboardView";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Season standings, hit rates and streaks for the daily spread forecast.",
};

export default function SpreadcastBoardPage() {
  return <LeaderboardView />;
}
