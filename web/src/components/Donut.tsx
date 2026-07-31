import type { ReactNode } from "react";

export interface DonutSegment {
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerSub?: ReactNode;
}

export function Donut({ segments, size = 124, thickness = 13, centerLabel, centerSub }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Decoration, not data. centerLabel and centerSub are HTML overlaid on
          this ring, not <text> inside it, so hiding the SVG keeps "38%" and
          "Your share" readable — the ring only restates them as an arc. */}
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={thickness} />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              strokeLinecap={seg.value / total > 0.02 && seg.value / total < 0.99 ? "round" : "butt"}
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerSub) && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            {centerLabel && <div style={{ fontWeight: 680, fontSize: "1.125rem", letterSpacing: "-0.02em" }} className="num">{centerLabel}</div>}
            {centerSub && <div className="muted" style={{ fontSize: "0.6875rem" }}>{centerSub}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
