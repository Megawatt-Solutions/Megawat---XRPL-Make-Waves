import type { Metadata } from "next";

import { HowView } from "@/components/spreadcast/HowView";

export const metadata: Metadata = {
  title: "How it works",
  description: "How the daily spread is measured, scored and settled, and how to verify it yourself.",
};

export default function SpreadcastHowPage() {
  return <HowView />;
}
