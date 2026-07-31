"use client";
// Root error boundary for the vaults half. Spreadcast has had one since it was
// built (it depends on a game API that can be unreachable), but the vaults side
// had none at all — so any runtime error on /, /portfolio, /marketplace,
// /dashboard-v2 or a vault page fell through to the framework's default screen.
//
// That screen says "Application error: a client-side exception has occurred" in
// production and nothing else: no nav, no way back, no indication which half of
// the app is broken. This keeps the shell mounted and says what still works.
//
// Deliberately mirrors spreadcast/error.tsx in structure and tone, inverted:
// that one reassures you the vaults are fine, this one reassures you the game
// is. Neither pretends the failure did not happen.

import { useEffect } from "react";
import Link from "next/link";
import { ShieldIcon } from "@/components/Icons";

export default function VaultsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[vaults]", error);
  }, [error]);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Something went wrong</h1>
        <div className="page-sub">This page didn&apos;t load. Spreadcast and the rest of the app are unaffected.</div>
      </div>

      <div className="card">
        <div className="empty-state">
          <ShieldIcon size={26} />
          <div className="empty-state-title">We couldn&apos;t render this page</div>
          {/* Careful with what this promises. A boundary catches a RENDER
              error, and it cannot know whether a transaction submitted a
              moment earlier went through — so it must not say "nothing was
              submitted" or "your funds are unaffected". It can only speak for
              the thing it actually knows about: this page failed to draw. */}
          <p className="empty-state-body">
            This is a display problem — the page failed to draw. Trying again usually clears it. If you had just
            submitted something, check your portfolio to confirm where it landed.
          </p>
          <div className="empty-state-actions">
            <button className="btn btn-accent btn-sm" onClick={reset}>
              Try again
            </button>
            <Link className="btn btn-ghost btn-sm" href="/">
              Back to vaults
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/portfolio">
              Your portfolio
            </Link>
          </div>
          {error.digest && (
            /* The digest is the only handle support has on a production error;
               the stack is stripped from the client build. */
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>
              Reference <span className="num">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
