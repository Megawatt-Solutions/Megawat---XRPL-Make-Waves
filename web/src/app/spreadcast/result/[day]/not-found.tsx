// A result URL that does not resolve.
//
// The route already knew it was a special case — generateMetadata returns
// { title: "Result not found" } when the day is missing — but notFound() had no
// boundary nearer than the root, so the page under that title was the generic
// one, and its body reads: "If you followed a link to a specific VAULT, it may
// have been renamed or closed." Someone opening a shared Spreadcast result got
// a correct tab title and an explanation of something else entirely.
//
// This is also the 404 most likely to be reached by a stranger rather than by a
// mistake. A result page is the one thing here built to be shared — it has its
// own opengraph-image — so its dead links arrive from chat apps and social
// posts, days or weeks after the round. "Browse vaults" is a poor answer to
// "what was the spread on the day someone told me about".
//
// Same .empty-state idiom and the same two-exit rule as the root 404; only the
// wording and the destinations change.

import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon } from "@/components/Icons";

export const metadata: Metadata = { title: "Result not found · Spreadcast" };

export default function ResultNotFound() {
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Result not found</h1>
        <div className="page-sub">No round settled on that date.</div>
      </div>

      <div className="card">
        <div className="empty-state">
          <ClockIcon size={26} />
          <div className="empty-state-title">Nothing settled that day</div>
          <p className="empty-state-body">
            Results exist only for days a round has finished. The link may point at a date that has not
            settled yet, or one from before Spreadcast started. Every settled day is in the log.
          </p>
          <div className="empty-state-actions">
            <Link className="btn btn-accent btn-sm" href="/spreadcast/log">
              See every result
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/spreadcast">
              Play today&apos;s round
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
