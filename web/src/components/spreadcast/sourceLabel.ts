/** How a settled round's price source is named in the UI.
 *
 * Both call sites used to inline `source === "entsoe" ? "ENTSO-E A44" :
 * "SIMULATED"` — a binary over a value space with at least three members. Every
 * round the API currently returns carries `source: "energy-charts"` (11 of 11 in
 * the archive), so that ternary stamped SIMULATED on every settled result in the
 * app, including the one in the Latest result card.
 *
 * Energy-Charts is Fraunhofer ISE republishing the ENTSO-E day-ahead series —
 * real market data, at PT15M resolution. The app says so itself two cards above:
 * the swings chart is badged REAL MARKET DATA and captioned "data: ENTSO-E via
 * Energy-Charts". Calling the same numbers simulated in the result card
 * undercut the one claim Spreadcast rests on — that the outcome comes from the
 * published market and not from us.
 *
 * A map rather than a ternary so an unrecognised source still falls back to
 * SIMULATED, which is the safe direction: never claim provenance the data does
 * not have.
 */
const SOURCE_LABEL: Record<string, { long: string; short: string }> = {
  entsoe: { long: "ENTSO-E A44", short: "ENTSO-E A44" },
  "energy-charts": { long: "ENTSO-E via Energy-Charts", short: "ENERGY-CHARTS" },
};

/** Roomy contexts — the Latest result pill. */
export function sourceLabel(source: string | undefined): string {
  return (source && SOURCE_LABEL[source]?.long) || "SIMULATED FEED";
}

/** Tight contexts — the archive table chip, which shares a row with four other
 *  columns and is hidden below 641px anyway. */
export function sourceLabelShort(source: string | undefined): string {
  return (source && SOURCE_LABEL[source]?.short) || "SIMULATED";
}
