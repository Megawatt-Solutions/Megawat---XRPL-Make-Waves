// The iOS home-screen icon.
//
// Without this, adding Megawatt to a home screen gives you a cropped screenshot
// of whatever page happened to be open — the one place a "high end app" is
// judged purely on a 180px square, and it was showing a thumbnail of a table.
//
// icon.svg already exists and does not cover this: Safari does not accept SVG
// for a touch icon, which is why Next only allows jpg/jpeg/png here. So the PNG
// is generated rather than committed as a binary, for the same reason the OG
// card is — the mark and the background come from the brand tokens, so they
// cannot drift from the palette the way a hand-exported file would.
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Brand tokens, mirrored from globals.css :root — same pair icon.svg uses.
const CARBON = "#0a0b0a";
const GREEN = "#42E7AA";

// The symbol from public/brand/megawatt-symbol-green.svg, unchanged.
const MARK =
  "M201.884 126.65V294.189L298.625 169.445L309.023 228.462L443.896 0L319.82 122.754" +
  "L317.765 87.6607L242.013 167.539V0L145.272 124.744L134.874 65.7275L0.000213623 294.189" +
  "L124.076 171.435L126.132 206.529L201.884 126.65Z";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: CARBON,
        }}
      >
        {/* No rounded corners and no padding ring: iOS applies its own mask and
            already insets the artwork, so adding either here means a second
            radius inside Apple's and a mark that reads too small on the home
            screen. The 444x295 viewBox is the symbol's own, so the aspect ratio
            is the brand's rather than one invented to fill a square. */}
        <svg width="124" height="82" viewBox="0 0 444 295" fill="none">
          <path fillRule="evenodd" clipRule="evenodd" d={MARK} fill={GREEN} />
        </svg>
      </div>
    ),
    size
  );
}
