"use client";
// Global-network split panel: globe on the left, site list on the right.
// Selecting a row (or a pin) focuses the globe on that site and pins its
// tooltip open; selecting again — or dragging the globe — releases it.
import { useState } from "react";
import { BessGlobe } from "./BessGlobe";
import { Flag } from "./Flag";
import { bessMarkers, CAPACITY } from "@/lib/protocol";

// A site that is physically running is a good state, so it reads green like
// every other live signal in the app. It was blue, which made the two real
// operational sites — the flagship ones — look like a different kind of thing
// from "active", when both simply mean live.
const STATUS_DOT: Record<string, string> = {
  active: "var(--accent)",
  operational: "var(--accent)",
  fundraising: "var(--amber)",
  coming_soon: "var(--gray)",
};

const SITES = bessMarkers()
  .slice()
  .sort((a, b) => b.capacityMw - a.capacityMw);

export function NetworkPanel() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="net-grid">
      <div className="net-globe">
        <BessGlobe focusId={selected} onSelect={setSelected} />
        <div className="net-hint caps">Drag to rotate · click a site to focus</div>
      </div>
      <div className="net-side">
        <div className="site-rows">
          {SITES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`site-row ${selected === s.id ? "selected" : ""}`}
              aria-pressed={selected === s.id}
              onClick={() => setSelected(selected === s.id ? null : s.id)}
            >
              {/* The flag takes the leading slot — location is what the eye
                  wants first in a list of sites. The status dot moves inline
                  with the text it describes, instead of floating loose in its
                  own column where it read as decoration. */}
              <Flag code={s.flag} size={18} title={s.location} />
              <span className="site-id">
                <span className="site-name">{s.name}</span>
                <span className="site-loc">
                  <span className="site-status-dot" style={{ background: STATUS_DOT[s.status] }} aria-hidden="true" />
                  {s.location}
                </span>
              </span>
              <span className="site-num">
                {s.capacityMw.toFixed(1)} MW
                <span className="caps">{s.status.replace("_", " ")}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="site-total">
          <span>Total installed</span>
          <span className="accent">
            {CAPACITY.mw.toFixed(1)} MW / {CAPACITY.mwh.toFixed(1)} MWh
          </span>
        </div>
      </div>
    </div>
  );
}
