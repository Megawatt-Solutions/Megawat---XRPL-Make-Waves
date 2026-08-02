// Spreadcast section shell. The global nav and bottom tab bar stay exactly
// where they are — this only adds the section bar beneath them, so there is
// still only ever one navigation root. See docs/ui-ux-rehaul.md §2.
//
// Holding the provider and the page chrome here means the countdown survives
// moving between Play / Board / Log / How: only `children` swaps.

import type { Metadata } from "next";
import { RoundProvider } from "@/components/spreadcast/RoundContext";
import { SectionBar } from "@/components/spreadcast/SectionBar";

// The four game routes each name themselves now, and this keeps the section in
// the title without every page repeating it. Distinct word FIRST — a tab
// truncates to roughly the first twenty characters, so "Leaderboard ·
// Spreadcast" survives that and "Spreadcast · Leaderboard" would not.
export const metadata: Metadata = {
  title: {
    template: "%s · Spreadcast - Megawatt",
    default: "Spreadcast - Megawatt",
  },
  description: "Call tomorrow's day-ahead spread on the Slovenian market. Free to play, every day.",
  // Without this the shared preview for the game read "Megawatt — BESS Vaults",
  // because og:title does not follow `title` — it has to be set. A link to the
  // game that advertises the vaults is a link doing the wrong job.
  openGraph: {
    title: "Spreadcast - Megawatt",
    description: "Call tomorrow's day-ahead spread on the Slovenian market. Free to play, every day.",
  },
};

export default function SpreadcastLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoundProvider>
      <SectionBar />
      <main className="page sc">
        {children}
        <p className="sc-legal">
          FREE SKILL-BASED PROMOTIONAL COMPETITION · 18+ · NO PURCHASE NECESSARY · PRIZES ARE PROMOTIONAL AWARDS
        </p>
      </main>
    </RoundProvider>
  );
}
