// Country flags as inline SVG.
//
// The vault data carries emoji flags ("🇸🇮"), which are regional-indicator
// pairs. Windows ships no flag-emoji font, so those render as the bare
// letters — "RS", "SI" — which is why the flags looked like they had
// vanished. Emoji cannot be relied on for this; these are drawn instead, so
// they look the same on every platform.
//
// All five countries in the network are simple tricolours. Slovenia and
// Serbia carry small heraldry at this size that would be illegible anyway,
// so the field alone is drawn — the flag is a location cue, not a rendition.

interface FlagSpec {
  bands: string[];
  vertical?: boolean;
}

const FLAGS: Record<string, FlagSpec> = {
  SI: { bands: ["#ffffff", "#0f47af", "#d52b1e"] }, // Slovenia
  RS: { bands: ["#c6363c", "#0c4076", "#ffffff"] }, // Serbia
  DE: { bands: ["#000000", "#dd0000", "#ffce00"] }, // Germany
  LT: { bands: ["#fdb913", "#006a44", "#c1272d"] }, // Lithuania
  RO: { bands: ["#002b7f", "#fcd116", "#ce1126"], vertical: true }, // Romania
};

/**
 * "🇸🇮" -> "SI". Regional indicators are U+1F1E6..U+1F1FF mapping to A..Z.
 * Returns null for anything that is not exactly two of them.
 */
export function countryCode(flagEmoji: string): string | null {
  const cps = Array.from(flagEmoji.trim()).map((c) => c.codePointAt(0) ?? 0);
  if (cps.length !== 2) return null;
  const BASE = 0x1f1e6;
  if (cps.some((c) => c < BASE || c > BASE + 25)) return null;
  return cps.map((c) => String.fromCharCode(65 + (c - BASE))).join("");
}

export function Flag({
  code,
  size = 16,
  title,
}: {
  /** ISO-3166 alpha-2, or an emoji flag — both accepted. */
  code: string;
  size?: number;
  title?: string;
}) {
  const cc = (code.length === 2 ? code.toUpperCase() : countryCode(code)) ?? "";
  const spec = FLAGS[cc];
  const w = size;
  const h = Math.round(size * 0.72);

  // Decorative unless the caller asks otherwise.
  //
  // Every one of these sits immediately before text that already names the
  // place — "SI Ljubljana, Slovenia", "SI BESS Ljubljana 01". With a name of
  // its own the flag announced the bare country code before each of them, 18
  // times on the overview page alone: not information, just a stutter in front
  // of the real label. Passing an explicit `title` opts back in, for a flag
  // that ever has to stand on its own.
  //
  // This matches what the note at the top of this file already says the flag
  // is for — "a location cue, not a rendition".
  const label = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const);

  // Unknown country: show the code rather than nothing, so it degrades to
  // roughly what the emoji fallback did instead of disappearing silently.
  if (!spec) {
    return (
      <span className="flag flag-fallback" {...label}>
        {cc || "?"}
      </span>
    );
  }

  const n = spec.bands.length;
  return (
    <svg
      className="flag"
      width={w}
      height={h}
      viewBox={`0 0 ${n * 10} ${Math.round(n * 10 * 0.72)}`}
      {...label}
      preserveAspectRatio="none"
    >
      {title && <title>{title}</title>}
      {spec.bands.map((fill, i) =>
        spec.vertical ? (
          <rect key={i} x={(i * n * 10) / n} y="0" width={(n * 10) / n} height={n * 10 * 0.72} fill={fill} />
        ) : (
          <rect key={i} x="0" y={(i * n * 10 * 0.72) / n} width={n * 10} height={(n * 10 * 0.72) / n} fill={fill} />
        )
      )}
    </svg>
  );
}
