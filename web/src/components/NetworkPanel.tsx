"use client";
// Global-network split panel: globe on the left, site list on the right.
// Selecting a row (or a pin) focuses the globe on that site and pins its
// tooltip open; selecting again — or dragging the globe — releases it.
import { useState } from "react";
import { BessGlobe } from "./BessGlobe";
import { Flag } from "./Flag";
import { bessMarkers, CAPACITY } from "@/lib/protocol";
import { fmtPower, fmtEnergy } from "@/lib/format";
import { statusLabel } from "./vaultStatus";

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
              {/* No title: the location is spelled out in this same row, so naming
                  the flag only repeats it. */}
              <Flag code={s.flag} size={18} />
              <span className="site-id">
                <span className="site-name">{s.name}</span>
                <span className="site-loc">
                  <span className="site-status-dot" style={{ background: STATUS_DOT[s.status] }} aria-hidden="true" />
                  {s.location}
                </span>
              </span>
              <span className="site-num">
                {/* fmtPower, not toFixed(1). This row is in MW, and forcing one
                    decimal on every site made BESS Ljubljana 01 read "0.3 MW"
                    where its own card says "350 kW" — the same site, rounded
                    away by 50kW, about 14% of it, on a dashboard. fmtPower picks
                    the unit by magnitude, so sub-megawatt sites keep their kW
                    and whole ones lose the trailing ".0" that no other surface
                    shows: 5.0 MW and 3.0 MW here against 5 MW and 3 MW on the
                    cards. */}
                {fmtPower(s.capacityMw * 1000)}
                {/* Raw enum. statusLabel() is the same fix BessGlobe got when
                    it was printing status.replace("_", " ") and producing a
                    third spelling of a status the app already had a word for.
                    This component was the sibling that did not get it. */}
                <span className="caps">{statusLabel(s.status)}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="site-total">
          <span>Total installed</span>
          <span className="accent">
            {fmtPower(CAPACITY.mw * 1000)} / {fmtEnergy(CAPACITY.mwh * 1000)}
          </span>
        </div>
      </div>
    </div>
  );
}
