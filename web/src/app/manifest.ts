import type { MetadataRoute } from "next";

// The web app manifest.
//
// Without one, "Add to Home Screen" gives a browser shortcut: the page title as
// the label, browser chrome on launch, and no splash. This app is already built
// for the standalone case and only lacked the file that says so — layout.tsx
// sets viewportFit: "cover" and the stylesheet pads the tab bar with
// env(safe-area-inset-bottom), both of which exist precisely for a window with
// no browser UI at the bottom.
//
// Colours are the brand tokens rather than new values. background_color paints
// the splash before first render and theme_color the system chrome, so if they
// disagree with --mw-carbon the launch flashes a different black than the app
// settles on. That is the same mistake the icon files carried until today: a
// near-black that was almost right and shared with nothing.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Megawatt · BESS Vaults",
    // Home screens truncate at roughly 12 characters, so this is chosen rather
    // than inherited: "Megawatt · BE…" would be the alternative.
    short_name: "Megawatt",
    description:
      "Invest in real battery energy storage systems, earn yield, and trade your position.",
    start_url: "/",
    display: "standalone",
    background_color: "#030907",
    theme_color: "#030907",
    orientation: "portrait",
    categories: ["finance"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
