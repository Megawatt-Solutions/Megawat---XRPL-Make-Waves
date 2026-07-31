"use client";
// Animated SVG energy-flow diagram. One uniformly-scaled viewBox so it stays
// crisp and responsive. Nodes + connectors are driven by telemetry.live.channels;
// flow direction sets colour (green = toward site, red = away) and dash motion.
import type { SiteLive, FlowChannel, FlowNodeKey } from "@/lib/telemetry";

const HOUSE = { x: 470, y: 282 };

interface Slot {
  x: number;
  y: number;
  path: string; // connector node → house
  labelDy: number; // label offset
}

const SLOTS: Record<FlowNodeKey, Slot> = {
  grid:    { x: 196, y: 118, path: "M 244 118 H 392 V 214", labelDy: 70 },
  solar:   { x: 744, y: 118, path: "M 696 118 H 548 V 214", labelDy: 70 },
  other:   { x: 120, y: 286, path: "M 168 286 H 350", labelDy: 70 },
  battery: { x: 820, y: 286, path: "M 772 286 H 590", labelDy: 78 },
  ev:      { x: 196, y: 470, path: "M 244 470 H 392 V 352", labelDy: 70 },
  hvac:    { x: 744, y: 470, path: "M 696 470 H 548 V 352", labelDy: 70 },
  house:   { x: HOUSE.x, y: HOUSE.y, path: "", labelDy: 0 },
};

function fmtFlow(kw: number | null): string {
  if (kw === null) return "- -";
  const p = Math.abs(kw);
  return p >= 1 ? `${Math.round(p * 100) / 100} kW` : `${Math.round(p * 1000)} W`;
}

type Dir = "in" | "out" | "idle" | "off";
function dirOf(kw: number | null): Dir {
  if (kw === null) return "off";
  if (kw > 0.001) return "in";
  if (kw < -0.001) return "out";
  return "idle";
}
const DIR_COLOR: Record<Dir, string> = {
  in: "var(--accent)",
  out: "var(--red)",
  idle: "rgba(255,255,255,0.18)",
  off: "rgba(255,255,255,0.10)",
};

// Minimal node glyphs (drawn in local 0..40 box, translated into place).
function Glyph({ k }: { k: FlowNodeKey }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "grid":
      return <g {...s}><path d="M14 6h12l3 28H11zM12 16h16M11 24h18M20 6v28" /></g>;
    case "solar":
      return <g {...s}><circle cx="20" cy="20" r="7" /><path d="M20 5v4M20 31v4M5 20h4M31 20h4M9 9l3 3M28 28l3 3M31 9l-3 3M12 28l-3 3" /></g>;
    case "battery":
      return <g {...s}><rect x="8" y="12" width="22" height="16" rx="2" /><path d="M30 17v6" /><path d="M19 16l-3 5h4l-3 5" stroke="var(--accent)" /></g>;
    case "other":
      return <g {...s}><rect x="9" y="7" width="22" height="26" rx="3" /><circle cx="20" cy="22" r="6" /><path d="M14 12h.01M18 12h.01" /></g>;
    case "ev":
      return <g {...s}><path d="M8 26v-6l4-8h16l4 8v6M8 26h24M8 26v3M32 26v3" /><circle cx="14" cy="26" r="2.4" /><circle cx="26" cy="26" r="2.4" /></g>;
    case "hvac":
      return <g {...s}><rect x="7" y="11" width="26" height="18" rx="2" /><path d="M11 16h8M11 20h6M24 25c3 0 5-2 5-5" /></g>;
    default:
      return null;
  }
}

function Node({ k, ch }: { k: FlowNodeKey; ch: FlowChannel }) {
  const slot = SLOTS[k];
  const dir = dirOf(ch.powerKw);
  const color = DIR_COLOR[dir];
  const live = dir === "in" || dir === "out";
  return (
    <g>
      <circle cx={slot.x} cy={slot.y} r={42} fill="#0f1413" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
      <circle cx={slot.x} cy={slot.y} r={42} fill="none" stroke={live ? color : "transparent"} strokeWidth={1.5} opacity={0.5} />
      <g transform={`translate(${slot.x - 20}, ${slot.y - 20})`} style={{ color: live ? color : "rgba(255,255,255,0.45)" }}>
        <Glyph k={k} />
      </g>
      {/* label */}
      <text x={slot.x} y={slot.y + slot.labelDy} textAnchor="middle" fontSize="14" fill="rgba(255,255,255,0.5)" fontWeight={500}>
        {ch.label}
      </text>
      {/* value badge */}
      <text x={slot.x} y={slot.y - slot.labelDy + 6} textAnchor="middle" fontSize="18" fill={live ? "#f1f4f2" : "rgba(255,255,255,0.35)"} fontWeight={680}>
        {fmtFlow(ch.powerKw)}
      </text>
      {ch.soc != null && (
        <text x={slot.x} y={slot.y + 4} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.7)" fontWeight={600}>{Math.round(ch.soc)}%</text>
      )}
    </g>
  );
}

function Connector({ k, ch }: { k: FlowNodeKey; ch: FlowChannel }) {
  const slot = SLOTS[k];
  if (!slot.path) return null;
  const dir = dirOf(ch.powerKw);
  const live = dir === "in" || dir === "out";
  return (
    <g>
      <path d={slot.path} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={2.5} />
      {live && (
        <path
          d={slot.path}
          fill="none"
          stroke={DIR_COLOR[dir]}
          strokeWidth={2.5}
          className={`flow-anim ${dir === "out" ? "out" : ""}`}
        />
      )}
    </g>
  );
}

export function EnergyFlow({ live }: { live: SiteLive }) {
  const byKey = new Map(live.channels.map((c) => [c.key, c]));
  const order: FlowNodeKey[] = ["grid", "solar", "other", "battery", "ev", "hvac"];
  const present = order.filter((k) => byKey.has(k));
  const houseConsuming = live.housePowerKw < 0;

  // A <title> rather than role="img" + aria-label.
  //
  // This diagram's numbers are <text> INSIDE the svg — solar output, battery
  // flow, house draw — and SVG text is already reachable. Adding role="img"
  // would collapse all of it into one string and LOSE those readings, which is
  // the opposite of the intent. A title names the diagram while leaving its
  // contents exposed.
  return (
    <svg
      viewBox="0 0 940 560"
      className="eflow"
      style={{ width: "100%", height: "auto", display: "block" }}
      aria-labelledby="eflow-title"
    >
      <title id="eflow-title">Live energy flow between solar, battery, site load and the grid</title>
      {/* connectors first (under nodes) */}
      {present.map((k) => <Connector key={`c-${k}`} k={k} ch={byKey.get(k)!} />)}

      {/* house */}
      <g>
        <circle cx={HOUSE.x} cy={HOUSE.y} r={118} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={26} strokeDasharray="1.5 7" />
        <circle cx={HOUSE.x} cy={HOUSE.y} r={90} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={2} />
        <circle cx={HOUSE.x} cy={HOUSE.y} r={64} fill="#0c100f" stroke={houseConsuming ? "var(--red)" : "var(--accent)"} strokeWidth={3} opacity={0.95} />
        <g transform={`translate(${HOUSE.x - 17}, ${HOUSE.y - 30})`} style={{ color: "rgba(255,255,255,0.85)" }}>
          <path d="M3 16 L17 4 L31 16 M7 13 V30 H27 V13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        <text x={HOUSE.x} y={HOUSE.y + 34} textAnchor="middle" fontSize="22" fontWeight={700} fill="#f1f4f2">
          {Math.round(live.housePowerKw * 100) / 100} <tspan fontSize="13" fill="rgba(255,255,255,0.55)">kW</tspan>
        </text>
      </g>

      {/* nodes on top */}
      {present.map((k) => <Node key={`n-${k}`} k={k} ch={byKey.get(k)!} />)}
    </svg>
  );
}
