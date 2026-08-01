"use client";
// Does this person want motion stopped?
//
// globals.css already honours `prefers-reduced-motion: reduce` — it clamps every
// animation and transition to 0.01ms and kills the four looping ones outright.
// What CSS cannot reach is JavaScript: a requestAnimationFrame loop keeps
// running no matter what the media query says.
//
// Two things in this app move continuously from JS, and they are the two most
// kinetic elements in it: the Odometer rolls its digits forever, and BessGlobe
// auto-rotates whenever it is not being dragged or hovered. So the setting was
// respected everywhere except the places most likely to trigger the symptom it
// exists for.
//
// Deliberately NOT applied to the countdowns (RoundContext, DailySpread) or the
// telemetry simulation (SiteMonitor, VaultDetail). Those are values changing
// once a second or once every 2.2s, not animation — a clock that stops is a
// broken clock, and reduced motion is about movement, not about freezing data.

// Verified 2026-08-01 by emulating the media feature over CDP and sampling the
// two loops 2.5s apart, which was not possible when this was written:
//
//   motion allowed   BessGlobe pins moved,  2 of 8 odometer reels moved
//   reduce           pins frozen identical, 0 of 8 reels moved
//
// Both gates work. The odometer check needed all eight reels — sampling only
// the first showed "no movement" in both states, because the leading digit of
// a six-figure number legitimately never turns.
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  // Starts false so the server render and the first client render agree; the
  // effect corrects it before paint matters. Nothing renders differently on
  // this value — it only decides whether a loop starts — so there is no
  // hydration mismatch to guard against.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    // addEventListener over the deprecated addListener, with no fallback: every
    // browser this app targets has supported it on MediaQueryList since 2020.
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
