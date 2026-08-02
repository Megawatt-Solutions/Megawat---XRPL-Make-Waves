// Per-day share card. This is the whole reason the result route earns its
// place: a shared link with no preview is a bare URL, but a card carrying the
// day's actual number is an artifact someone will paste on purpose.
//
// Every value comes from the settled round. Nothing is rounded differently
// from the page, and nothing is shown that the page does not also show.
import { ImageResponse } from "next/og";
import { archiveDay } from "@/lib/spreadcast/store";
import { BAND_NAMES, bandLabel } from "@/lib/spreadcast/bands";

export const alt = "Spreadcast settled result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CARBON = "#030907";
const GREEN = "#42e7aa";
const PAPER = "#ffffff";
const CONDUIT = "#9c9c9c";

// The five band colours, mirrored from --sc-b0..b4 in globals.css.
const BAND_HEX = ["#3b82f6", "#22d3ee", "#42e7aa", "#fbbf24", "#f87171"];

// params is a Promise here exactly as it is in page.tsx. Destructuring it
// synchronously does not throw — it yields `undefined`, archiveDay finds
// nothing, and the card renders the generic fallback with a 200. It looked
// like it worked; only opening the PNG showed the number was missing.
// Sizes in this file are px on purpose, against the rem convention used
// everywhere else. This renders through Satori to a fixed 1200x630 raster:
// there is no viewer, no root element and no user font-size setting for a
// rem to be relative to. Satori does resolve rem — verified, the card came
// out correct — but depending on that buys nothing and invites the next
// person to think the root scale affects this image. It does not.
export default async function ResultOgImage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;

  let spread: string | null = null;
  let band = 2;
  let name = "";
  let label = "";
  try {
    const { round } = await archiveDay(day);
    if (round && round.outcomeBand != null && round.spread != null) {
      spread = round.spread.toFixed(2);
      band = round.outcomeBand;
      name = BAND_NAMES[band];
      label = bandLabel(band, round.boundaries);
    }
  } catch {
    /* fall through to the generic card below */
  }

  const accent = BAND_HEX[band] ?? GREEN;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CARBON,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        {/* The band rule, with this day's band lit and the rest dimmed — the
            result readable at a glance even before the number is.

            Nothing is lit when there is no result. `band` defaults to 2 so the
            colour lookup has something to work with, and that default used to
            reach the rule: a card for a day that does not exist showed the
            middle band at full opacity, asserting an outcome that was never
            determined. A default that exists to keep a lookup safe must not
            become a claim. */}
        <div style={{ display: "flex", height: 6, width: "100%" }}>
          {BAND_HEX.map((c, i) => (
            <div key={i} style={{ flex: 1, background: c, opacity: spread && i === band ? 1 : 0.22 }} />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* "SETTLED RESULT" only when one settled. This eyebrow was
              unconditional, so the card for a day with no result read
              "SETTLED RESULT · SI DAY-AHEAD · 2099-01-01" — a settlement
              claimed for a date 73 years out, on the artifact that renders in
              a chat window when someone pastes the link.

              The page itself 404s for that day; this image returns 200. So a
              dead link previewed as a settled result, and the preview is the
              only part most people ever see. The date goes too — it is the
              specific thing that made the claim look sourced. */}
          <div style={{ display: "flex", fontSize: 24, color: CONDUIT, letterSpacing: "0.16em" }}>
            {spread ? `SETTLED RESULT · SI DAY-AHEAD · ${day}` : "SI DAY-AHEAD · FREE DAILY GAME"}
          </div>

          {spread ? (
            /* One explicit column, not a fragment. Satori flattens fragments
               into the parent, which put the band chip beside the figure
               instead of under it — legible by luck rather than by layout. */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <div style={{ fontSize: 128, fontWeight: 700, color: PAPER, letterSpacing: "-0.04em" }}>
                  {spread}
                </div>
                <div style={{ fontSize: 40, color: CONDUIT }}>€/MWh</div>
              </div>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: accent }}>
                {name} · {label}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: PAPER }}>Spreadcast</div>
          )}

          <div style={{ display: "flex", fontSize: 26, color: CONDUIT, maxWidth: 900 }}>
            The gap between the day&apos;s highest and lowest electricity price — the number grid batteries earn
            on.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill={GREEN} />
          </svg>
          <div style={{ fontSize: 22, color: PAPER, letterSpacing: "0.16em" }}>
            MEGAWATT · SPREADCAST · FREE DAILY GAME
          </div>
        </div>
      </div>
    ),
    size
  );
}
