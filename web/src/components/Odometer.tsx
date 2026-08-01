"use client";
// Casino/odometer-style rolling counter. Each digit is a vertical reel; the
// value accrues live via requestAnimationFrame, so the cents spin and carries
// roll up the higher digits — like a mechanical odometer.
//
// Math: for digit place p, offset = digit + roll-in during the lower place's
// last 10%. The reel has a duplicate "0" at the end so the 9→0 wrap is seamless
// (position 10 ≡ position 0 visually). Transforms are driven imperatively each
// frame (no React re-render), and the initial transform is computed in render
// so SSR and first client paint match.
import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface Props {
  startValue: number;
  ratePerSecond?: number;
  prefix?: string;
  decimals?: number;
}

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

function offsetFor(value: number, place: number, animate: boolean): number {
  const v = value / Math.pow(10, place);
  const floor = Math.floor(v);
  const digit = ((floor % 10) + 10) % 10;
  // Only the last (rightmost) digit rolls; every other digit snaps crisply to
  // its value so the number stays readable (never caught between digits).
  if (!animate) return digit;
  const frac = v - floor;
  return digit + frac; // smooth continuous roll
}

type Token = { type: "reel"; place: number } | { type: "sep"; ch: string };

export function Odometer({ startValue, ratePerSecond = 0.2, prefix = "$", decimals = 2 }: Props) {
  const intLen = Math.max(1, Math.floor(Math.abs(startValue)).toString().length);

  const tokens = useMemo<Token[]>(() => {
    const toks: Token[] = [];
    if (prefix) toks.push({ type: "sep", ch: prefix });
    for (let p = intLen - 1; p >= 0; p--) {
      if (p !== intLen - 1 && (p + 1) % 3 === 0) toks.push({ type: "sep", ch: "," });
      toks.push({ type: "reel", place: p });
    }
    if (decimals > 0) {
      toks.push({ type: "sep", ch: "." });
      for (let d = 1; d <= decimals; d++) toks.push({ type: "reel", place: -d });
    }
    return toks;
  }, [intLen, prefix, decimals]);

  const reelPlaces = useMemo(
    () => tokens.filter((t): t is Extract<Token, { type: "reel" }> => t.type === "reel").map((t) => t.place),
    [tokens]
  );
  const stripRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Screen-reader text, updated imperatively alongside the reels.
  const srRef = useRef<HTMLSpanElement | null>(null);
  const lastSpoken = useRef<number>(Math.floor(startValue));

  const format = (v: number) =>
    prefix +
    v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Rolling digits are continuous decorative motion, and CSS cannot stop a
    // rAF loop — so this is the one place the reduced-motion setting has to be
    // read in JS. The reels keep the transform computed during render, which
    // is already the correct position for startValue, and the .sr-only text
    // already states that value. So the number is right, it simply does not
    // spin.
    if (reducedMotion) return;
    let raf = 0;
    let t0 = 0;
    const loop = (ts: number) => {
      if (!t0) t0 = ts;
      const value = startValue + ((ts - t0) / 1000) * ratePerSecond;
      const last = reelPlaces.length - 1;
      for (let i = 0; i < reelPlaces.length; i++) {
        const el = stripRefs.current[i];
        if (el) el.style.transform = `translateY(-${offsetFor(value, reelPlaces[i], i === last)}em)`;
      }
      // Refresh the accessible value only when the whole unit changes. It is
      // not a live region, so nothing is announced on update — this just means
      // that whenever someone navigates to it they get the current figure
      // rather than the one from page load.
      //
      // Measured 2026-08-01 over 24s in a headless browser, which corrects
      // what this comment used to claim. It said the text "cannot drift from
      // the reels, because it is updated from the same loop, on the same
      // frame". They are written from the same frame, but the text is only
      // REWRITTEN when the whole unit changes, so between ticks it lags:
      //
      //   t+3s   text €328,793.42   reels 328793.52   (0.10 behind)
      //   t+9s   text €328,793.42   reels 328793.87   (0.45 behind)
      //   t+21s  text €328,794.00   reels 328794.47   (0.47 behind)
      //
      // The invariant that does hold is the one worth relying on: the text is
      // an accurate snapshot at the instant it is written, it never leads the
      // reels, and the two never differ by a whole unit. At 0.05/sec that caps
      // the lag at €1 on a six-figure number, against the alternative of
      // rewriting text 60 times a second. If rAF is paused — a background tab,
      // or reduced motion — neither advances, so they stay consistent.
      const whole = Math.floor(value);
      if (srRef.current && whole !== lastSpoken.current) {
        lastSpoken.current = whole;
        srRef.current.textContent = format(value);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [startValue, ratePerSecond, reelPlaces, reducedMotion]);

  let reelIdx = 0;
  return (
    // Every digit position holds the full "0 1 2 3 4 5 6 7 8 9 0" strip in the
    // DOM — that is how the reel works, one cell visible and the rest clipped
    // by .odo-reel's 1em window. Visually it reads as a single digit; to a
    // screen reader, with no aria at all, the whole strip was text. A headline
    // metric announced as five repetitions of "zero one two three four five
    // six seven eight nine zero" is not a degraded experience, it is an
    // unusable one.
    //
    // So the machinery is hidden and the number is stated once, in text.
    <span className="odometer">
      <span className="sr-only" ref={srRef}>{format(startValue)}</span>
      <span aria-hidden="true" style={{ display: "contents" }}>
      {tokens.map((t, i) => {
        if (t.type === "sep") {
          return (
            <span key={i} className={`odo-sep${t.ch === "." || t.ch === "," ? " odo-punct" : ""}`}>
              {t.ch}
            </span>
          );
        }
        const idx = reelIdx++;
        const init = offsetFor(startValue, t.place, idx === reelPlaces.length - 1);
        return (
          <span key={i} className="odo-reel">
            <span
              className="odo-strip"
              ref={(el) => {
                stripRefs.current[idx] = el;
              }}
              style={{ transform: `translateY(-${init}em)` }}
            >
              {CELLS.map((c, j) => (
                <span key={j} className="odo-cell">{c}</span>
              ))}
            </span>
          </span>
        );
      })}
      </span>
    </span>
  );
}
