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

  return (
    <main className="page sc">
      <div className="panel sc-panel" style={{ marginTop: 24 }}>
        <span className="tick tl" />
        <span className="tick tr" />
        <span className="tick bl" />
        <span className="tick br" />
        <h2>Spreadcast is having a moment</h2>
        <p className="sc-notice" style={{ marginTop: 8 }}>
          Something went wrong loading the forecasting game. The rest of Megawatt — vaults, portfolio and
          marketplace — is unaffected.
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
    </main>
  );
}
