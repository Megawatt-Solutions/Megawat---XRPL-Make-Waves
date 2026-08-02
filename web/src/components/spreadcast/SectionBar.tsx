"use client";
// The Spreadcast section bar: four real routes on the left, live status on the
// right. Sticks directly under the global .nav.
//
// Deliberately built from the same idiom as .nav-link — brand eyebrow type, 2px
// accent underline on active — rather than as a new pill/segmented control. The
// point is that Spreadcast reads as a *section of Megawatt*, not as a second app
// with its own navigation language. See docs/ui-ux-rehaul.md §2.1.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRound } from "./RoundContext";

const TABS = [
  { href: "/spreadcast", label: "Play" },
  { href: "/spreadcast/board", label: "Board" },
  { href: "/spreadcast/log", label: "Log" },
  { href: "/spreadcast/how", label: "How" },
];

export function SectionBar() {
  const pathname = usePathname();
  const { isOpen, countdown, msToClose, streak, err } = useRound();

  // Under 30 minutes the countdown earns attention; above it, it's just status.
  const urgent = msToClose != null && msToClose < 30 * 60 * 1000;

  return (
    <nav className="sc-bar" aria-label="Spreadcast">
      <div className="sc-bar-tabs">
        {TABS.map((t) => {
          const active = t.href === "/spreadcast" ? pathname === "/spreadcast" : pathname.startsWith(t.href);
          return (
            // aria-current, not aria-pressed: these are navigation links, and
            // "current page" is the state that matters. It was signalled by
            // colour alone.
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`sc-bar-tab${active ? " active" : ""}`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {!err && (
        <div className="sc-bar-status">
          {/* "07:13:29" on its own names nothing, and title= is unreliable —
              touch never shows it and several readers skip it. The digits are
              hidden from assistive tech and a spoken equivalent sits beside
              them.

              Deliberately NOT a live region. This re-renders every second, and
              announcing it on each tick would talk over everything else on the
              page continuously. It reads when navigated to, which is when the
              answer is actually wanted. */}
          <span className="sc-bar-clock">
            <span className={`sc-bar-dot${urgent ? " urgent" : ""}`} />
            {/* The comment above is right that "07:13:29" on its own names
                nothing — and the fix it describes only reached assistive tech.
                A sighted user got the bare digits, and the digits carry TWO
                opposite meanings: time until entries close while a round is
                open, and time until the next round opens while it is not. The
                sr-only string beside this already distinguishes them; the
                screen did not, so the accessible version was strictly more
                informative than the visual one.
                aria-hidden, like the digits, because the sr-only sibling
                already says all of this in a fuller sentence — without it the
                word would be read twice. */}
            <span className="sc-bar-clock-label" aria-hidden="true">{isOpen ? "closes" : "opens"}</span>
            <span className="num" aria-hidden="true">{countdown}</span>
            <span className="sr-only">
              {/* Between rounds the countdown is an em dash, which reads out as
                  "dash until the next round opens". Only speak the digits when
                  there are digits. */}
              {/\d/.test(countdown)
                ? `${countdown} ${isOpen ? "until entries close" : "until the next round opens"}`
                : isOpen
                  ? "Entries are open"
                  : "Waiting for the next round to open"}
            </span>
          </span>
          {streak != null && streak > 0 && (
            <span className="sc-bar-streak" title={`${streak}-day streak`}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2c.7 3-1.2 4.6-1.2 7a2.7 2.7 0 0 0 .8 2c-1.6-.3-2.6-1.5-2.8-3.2C7.6 9 6.5 10.7 6.5 12.7A5.5 5.5 0 0 0 12 18.2a5.5 5.5 0 0 0 5.5-5.5C17.5 7.6 13.4 6.2 12 2z"
                  fill="currentColor"
                />
              </svg>
              <span className="num" aria-hidden="true">{streak}</span>
              <span className="sr-only">{streak}-day streak</span>
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
