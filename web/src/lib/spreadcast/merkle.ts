// ── Merkle anchoring ─────────────────────────────────────────────
// Weekly, the platform writes one XRPL transaction carrying the Merkle root
// of every prediction + outcome that week — one public audit record over the
// whole week. Leaves are the same salted commit hashes players sign daily.

import { createHash } from "crypto";

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Commit hash: sha256(day|band|exactGuess|salt). Published pre-close on
 * chain and revealed with the salt after settlement. */
export function commitHash(day: string, band: number, exact: number | null, salt: string): string {
  return sha256Hex(`${day}|${band}|${exact ?? ""}|${salt}`);
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return sha256Hex("empty");
  let level = leaves.map((l) => l.toLowerCase()).sort(); // canonical order
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : a;
      next.push(sha256Hex(a + b));
    }
    level = next;
  }
  return level[0];
}
