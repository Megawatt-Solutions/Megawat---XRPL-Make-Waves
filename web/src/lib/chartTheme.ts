"use client";
// Chart.js draws to <canvas>, which cannot resolve CSS custom properties —
// var(--accent) in a dataset colour is simply ignored. So the charts used to
// hardcode hexes, which meant every token change silently left them behind.
//
// This reads the live token values off :root once on mount and hands back
// canvas-safe strings. Fallbacks mirror globals.css so a failed read still
// renders in brand colours rather than the old emerald palette.
//
// Brand source of truth: docs/ui-ux-rehaul.md §3.

import { useEffect, useState } from "react";

export interface ChartTheme {
  accent: string;
  amber: string;
  blue: string;
  red: string;
  teal: string;
  periwinkle: string;
  text: string;
  text2: string;
  muted: string;
  elevated: string;
  border: string;
  grid: string;
}

const FALLBACK: ChartTheme = {
  accent: "#42e7aa",
  amber: "#d9b356",
  blue: "#7fa8d9",
  red: "#d96a6a",
  teal: "#4fb3a6",
  periwinkle: "#9fb4d9",
  text: "#ffffff",
  text2: "#aab2ae",
  muted: "#737373",
  elevated: "#1c2220",
  border: "rgba(255,255,255,0.1)",
  grid: "rgba(255,255,255,0.05)",
};

function readTokens(): ChartTheme {
  if (typeof window === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: v("--accent", FALLBACK.accent),
    amber: v("--amber", FALLBACK.amber),
    blue: v("--blue", FALLBACK.blue),
    red: v("--red", FALLBACK.red),
    teal: v("--chart-teal", FALLBACK.teal),
    periwinkle: v("--chart-periwinkle", FALLBACK.periwinkle),
    text: v("--text", FALLBACK.text),
    text2: v("--text-2", FALLBACK.text2),
    muted: v("--muted", FALLBACK.muted),
    elevated: v("--elevated", FALLBACK.elevated),
    border: FALLBACK.border,
    grid: FALLBACK.grid,
  };
}

/** Resolved design tokens for canvas rendering. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);
  useEffect(() => setTheme(readTokens()), []);
  return theme;
}

/**
 * Canvas-safe translucent fill. Chart.js needs a concrete colour string —
 * color-mix() is not reliably parseable in a canvas context — so convert
 * a resolved hex to rgba() here rather than leaning on CSS.
 */
export function alpha(color: string, a: number): string {
  const hex = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex; // already rgb()/rgba()/named - hand it back untouched
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
