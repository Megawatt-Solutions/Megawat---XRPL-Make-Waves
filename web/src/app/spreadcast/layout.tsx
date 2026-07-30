// Spreadcast section shell. The global nav and bottom tab bar stay exactly
// where they are — this only adds the section bar beneath them, so there is
// still only ever one navigation root. See docs/ui-ux-rehaul.md §2.
//
// Holding the provider and the page chrome here means the countdown survives
// moving between Play / Board / Log / How: only `children` swaps.

import type { Metadata } from "next";
import { RoundProvider } from "@/components/spreadcast/RoundContext";
import { SectionBar } from "@/components/spreadcast/SectionBar";

export const metadata: Metadata = {
  title: "Spreadcast — Megawatt",
  description: "Call tomorrow's day-ahead spread on the Slovenian market. Free to play, every day.",
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
