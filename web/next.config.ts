import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Pin the workspace root to web/ (a stray lockfile in $HOME otherwise
  // confuses Turbopack's root inference).
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  // xrpl.js (Spreadcast anchoring) pulls in ws; keep it server-side only.
  serverExternalPackages: ["xrpl"],
  // File-watch events get dropped on this machine (fsevents and
  // WATCHPACK_POLLING both miss changes), so dev runs webpack with
  // explicit stat polling — see package.json "dev".
  webpack: (config, { dev }) => {
    if (dev) config.watchOptions = { poll: 700, aggregateTimeout: 200 };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
