import type { Metadata } from "next";

// Play — the daily ritual, and the section's index route.
// Chrome (section bar, page wrapper, legal line) lives in layout.tsx.
import { PlayView } from "@/components/spreadcast/PlayView";

export const metadata: Metadata = {
  // Spelled out rather than left as "Play". A layout's template applies to its
  // CHILD segments, so board/log/how pick up "· Spreadcast" but this page —
  // which sits in the same segment as that layout — falls back to the root
  // template and would read only "Play — Megawatt".
  title: "Play · Spreadcast",
  description: "Call tomorrow's day-ahead spread on the Slovenian market. One pick a day, free to play.",
};

export default function SpreadcastPlayPage() {
  return <PlayView />;
}
