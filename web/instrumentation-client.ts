import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const isProduction = process.env.NODE_ENV === "production";

if (!token || !host) {
  if (!isProduction) {
    const missing = [
      !token && "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
      !host && "NEXT_PUBLIC_POSTHOG_HOST",
    ]
      .filter(Boolean)
      .join(", ");
    console.error(
      `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`
    );
  }
} else if (isProduction) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
  });
}
