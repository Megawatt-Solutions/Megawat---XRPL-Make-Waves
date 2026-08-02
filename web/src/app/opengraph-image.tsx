// The social preview card.
//
// Every route had og: tags but no image, so a link pasted into Slack, WhatsApp
// or anywhere else rendered as a bare URL — the link doing no work for a
// product whose vault URLs are meant to be shared.
//
// Generated rather than designed as a file, deliberately. Nothing here is
// invented: the colours are the brand tokens from globals.css (Carbon, the
// green, Conduit), the wordmark is the same lockup the nav uses, and the
// wording is the brand's own line. A hand-made PNG would drift from the
// palette the first time a token changed; this cannot.
import { ImageResponse } from "next/og";

export const alt = "Megawatt - battery energy storage, tokenised on the XRP Ledger";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens, mirrored from globals.css :root.
const CARBON = "#030907";
const GREEN = "#42e7aa";
const PAPER = "#ffffff";
const CONDUIT = "#9c9c9c";

// Sizes in this file are px on purpose, against the rem convention used
// everywhere else. This renders through Satori to a fixed 1200x630 raster:
// there is no viewer, no root element and no user font-size setting for a
// rem to be relative to. Satori does resolve rem — verified, the card came
// out correct — but depending on that buys nothing and invites the next
// person to think the root scale affects this image. It does not.
export default async function OpengraphImage() {
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
        {/* The band gradient the app uses as its one recurring graphic device. */}
        <div style={{ display: "flex", height: 6, width: "100%" }}>
          <div style={{ flex: 1, background: "#3b82f6" }} />
          <div style={{ flex: 1, background: "#22d3ee" }} />
          <div style={{ flex: 1, background: GREEN }} />
          <div style={{ flex: 1, background: "#fbbf24" }} />
          <div style={{ flex: 1, background: "#f87171" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* The wordmark's lightning glyph, same path as components/Icons. */}
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill={GREEN} />
            </svg>
            <div style={{ fontSize: 40, fontWeight: 700, color: PAPER, letterSpacing: "0.14em" }}>
              MEGAWATT
            </div>
          </div>

          {/* Two rows rather than a <br/>. Satori requires an explicit display
              on any element with more than one child, and text + <br/> + <span>
              is three — which fails the whole render, not just that line. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 68,
              fontWeight: 700,
              color: PAPER,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            <div style={{ display: "flex" }}>Offchain energy</div>
            <div style={{ display: "flex", color: GREEN }}>Onchain yield</div>
          </div>

          <div style={{ fontSize: 27, color: CONDUIT, maxWidth: 820, lineHeight: 1.4 }}>
            Real battery storage sites across Europe. Deposit RLUSD, earn a share of what they make on the
            day-ahead market.
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: CONDUIT, letterSpacing: "0.16em" }}>
          NO TOKEN · NO EMISSIONS · JUST ENERGY REVENUE
        </div>
      </div>
    ),
    size
  );
}
