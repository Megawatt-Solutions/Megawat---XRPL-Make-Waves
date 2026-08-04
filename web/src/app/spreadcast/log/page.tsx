import type { Metadata } from "next";

import { ArchiveView } from "@/components/spreadcast/ArchiveView";

export const metadata: Metadata = {
  title: "Results",
  description: "Every settled round, its published boundaries and the on-chain commitment behind it.",
};

export default function SpreadcastLogPage() {
  return <ArchiveView />;
}
