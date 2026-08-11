import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// A stack frame is build-tool noise when it comes from the Next.js dev
// pipeline instead of application code: Next internals shipped in
// node_modules/next/dist, or modules served through the webpack dev runtime.
function isBuildToolFrame(filename: unknown): boolean {
  if (typeof filename !== "string") {
    return false;
  }
  return (
    filename.startsWith("webpack-internal:///") ||
    filename.includes("node_modules/next/dist")
  );
}

// The dev server captures its own build and hot-reload failures as exceptions
// and ships them to the same project as production traffic. Drop an exception
// when every stack frame is build-tool noise, so real errors still get through.
function dropBuildToolExceptions(
  event: CaptureResult | null
): CaptureResult | null {
  if (!event || event.event !== "$exception") {
    return event;
  }

  const exceptions = event.properties?.$exception_list;
  if (!Array.isArray(exceptions)) {
    return event;
  }

  const frames = exceptions.flatMap(
    (exception) => exception?.stacktrace?.frames ?? []
  );
  if (frames.length === 0) {
    return event;
  }

  const allBuildToolFrames = frames.every((frame) =>
    isBuildToolFrame(frame?.filename)
  );
  return allBuildToolFrames ? null : event;
}

if (!token || !host) {
  if (process.env.NODE_ENV !== "production") {
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
} else {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    before_send: dropBuildToolExceptions,
    debug: process.env.NODE_ENV === "development",
  });
}
