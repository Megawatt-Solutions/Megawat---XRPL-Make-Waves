// The 404 was the framework's default: a bare "404 — This page could not be
// found." sitting inside our own nav, which is the one screen in the app that
// looked like it belonged to a different product. It is also not a rare screen:
// vault URLs get shared and bookmarked, and a link to a vault that has been
// renamed or removed lands exactly here.
//
// Treated as an empty state rather than an error, because that is what it is —
// nothing went wrong, the address just does not point at anything. So it uses
// the same .empty-state idiom as an empty portfolio or an empty marketplace,
// and spends its space on exits rather than on apologising.

import type { Metadata } from "next";
import Link from "next/link";
import { LayersIcon } from "@/components/Icons";

// The layout's title work was done because "browser history was a wall of the
// same string" — and this page was missed by it. With no metadata export the
// 404 inherited the layout `default`, so a dead vault link opened a tab
// labelled "Megawatt — BESS Vaults": history, bookmarks and the tab strip all
// recorded a page that does not exist as the vaults page.
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Page not found</h1>
        <div className="page-sub">The address you followed doesn&apos;t point at anything.</div>
      </div>

      <div className="card">
        <div className="empty-state">
          <LayersIcon size={26} />
          <div className="empty-state-title">Nothing at this address</div>
          <p className="empty-state-body">
            If you followed a link to a specific vault, it may have been renamed or closed since that link was
            made. Everything below still works.
          </p>
          <div className="empty-state-actions">
            <Link className="btn btn-accent btn-sm" href="/">
              Browse vaults
            </Link>
            {/* Two exits, not three. At 390px a third button wraps onto its
                own line and centres there, which reads as a mis-layout. These
                are the app's two halves; the nav is right there for the rest. */}
            <Link className="btn btn-ghost btn-sm" href="/spreadcast">
              Play Spreadcast
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
