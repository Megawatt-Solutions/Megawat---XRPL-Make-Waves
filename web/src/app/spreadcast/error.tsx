"use client";
// Section-level error boundary. Spreadcast depends on a game API that can be
// unreachable (worker down, no local env), and without a boundary any runtime
// error here white-screens the whole app — including the vaults half, which
// has nothing to do with the game. Contain the blast radius to this section:
// the global nav stays mounted, so the user can always leave.

import { useEffect } from "react";

export default function SpreadcastError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[spreadcast]", error);
  }, [error]);

  // The sibling boundary in app/error.tsx explains why a failed page must not
  // keep the title of the route that failed: a tab reading "Spreadcast ·
  // Megawatt" while showing a failure is how someone loses the broken tab
  // among the working ones. That reasoning applies here and this file never
  // did it at all.
  // Re-asserted rather than assigned, for the reason measured on the sibling:
  // Next writes the <title> element directly after the boundary mounts, so a
  // plain assignment runs and is then silently undone.
  useEffect(() => {
    const WANT = "Spreadcast is having a moment · Megawatt";
    const apply = () => {
      if (document.title !== WANT) document.title = WANT;
    };
    apply();
    const el = document.querySelector("title");
    if (!el) return;
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // layout.tsx already provides <main className="page sc">, so render only the
  // panel here — otherwise the section would nest two <main> elements.
  return (
    <div className="panel sc-panel" style={{ marginTop: 24 }}>
      <span className="tick tl" />
      <span className="tick tr" />
      <span className="tick bl" />
      <span className="tick br" />
      <h2>Spreadcast is having a moment</h2>
      <p className="sc-notice" style={{ marginTop: 8 }}>
        Something went wrong loading the forecasting game. The rest of Megawatt - vaults, portfolio and marketplace —
        is unaffected.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-accent btn-sm" onClick={reset}>
          Try again
        </button>
        <a className="btn btn-ghost btn-sm" href="/dashboard-v2">
          Back to overview
        </a>
      </div>
    </div>
  );
}
