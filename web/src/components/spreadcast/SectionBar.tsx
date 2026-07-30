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
            <Link key={t.href} href={t.href} className={`sc-bar-tab${active ? " active" : ""}`}>
              {t.label}
            </Link>
          );
        })}
      </div>

      {!err && (
        <div className="sc-bar-status">
          <span className="sc-bar-clock" title={isOpen ? "Time until entries close" : "Time until the next round opens"}>
            <span className={`sc-bar-dot${urgent ? " urgent" : ""}`} />
            <span className="num">{countdown}</span>
          </span>
          {streak != null && streak > 0 && (
            <span className="sc-bar-streak" title={`${streak}-day streak`}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2c.7 3-1.2 4.6-1.2 7a2.7 2.7 0 0 0 .8 2c-1.6-.3-2.6-1.5-2.8-3.2C7.6 9 6.5 10.7 6.5 12.7A5.5 5.5 0 0 0 12 18.2a5.5 5.5 0 0 0 5.5-5.5C17.5 7.6 13.4 6.2 12 2z"
                  fill="currentColor"
                />
              </svg>
              <span className="num">{streak}</span>
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
