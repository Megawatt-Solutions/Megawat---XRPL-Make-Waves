// A permanent, shareable page for one settled round.
//
// This is the only route in the app designed to be arrived at by someone with
// no context — a link pasted into a chat by a player. So it answers, in order:
// what happened, what this game is, and what you can do about it. The app's own
// players get the same page from the results log, where the sharing starts.
//
// It reads archiveDay() directly rather than fetching its own API route: same
// function the route handler calls, without a server making an HTTP request to
// itself. Nothing here is computed that the log does not already show.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveDay } from "@/lib/spreadcast/store";
import { BAND_NAMES, bandLabel } from "@/lib/spreadcast/bands";
import { sourceLabel } from "@/components/spreadcast/sourceLabel";

const BAND_VARS = ["--sc-b0", "--sc-b1", "--sc-b2", "--sc-b3", "--sc-b4"];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function prettyDay(day: string) {
  // Fixed locale and UTC: the day is a market delivery date, not a local one,
  // and letting it shift by timezone would relabel the very thing being cited.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Narrowed to the fields this page actually asserts. A round missing either a
 * spread or a band is not a settled result, and rendering one would put an
 * empty figure under a headline that promises a number.
 */
type SettledRound = {
  spread: number;
  outcomeBand: number;
  boundaries: number[];
  /** Provenance fields are optional upstream, so each renders only if present
      rather than printing an empty cell under a heading that promises one. */
  source?: string;
  resolution?: string;
  settledAt?: string;
};

async function load(day: string): Promise<SettledRound | null> {
  if (!DAY_RE.test(day)) return null;
  try {
    const { round } = await archiveDay(day);
    if (!round || round.outcomeBand == null || round.spread == null) return null;
    return {
      spread: round.spread,
      outcomeBand: round.outcomeBand,
      boundaries: round.boundaries,
      source: round.source,
      resolution: round.resolution,
      settledAt: round.settledAt,
    };
  } catch {
    return null; // game API unreachable - handled as "no such result"
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ day: string }>;
}): Promise<Metadata> {
  const { day } = await params;
  const round = await load(day);
  if (!round) return { title: "Result not found" };

  const band = BAND_NAMES[round.outcomeBand];
  const title = `${round.spread.toFixed(2)} €/MWh · ${band}`;
  const description = `Slovenia's day-ahead spread on ${prettyDay(day)} came in at ${round.spread.toFixed(
    2
  )} €/MWh - ${band.toLowerCase()}. Call tomorrow's on Spreadcast, free.`;

  return {
    title,
    description,
    // No `images` key: the sibling opengraph-image.tsx for this route supplies
    // a card built from this day's own numbers.
    openGraph: { type: "article", siteName: "Megawatt", title: `${title} - Spreadcast`, description },
  };
}

export default async function ResultPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const round = await load(day);
  if (!round) notFound();

  const band = round.outcomeBand;
  const name = BAND_NAMES[band];
  const label = bandLabel(band, round.boundaries);
  const settled = round.settledAt ? new Date(round.settledAt) : null;

  return (
    <>
      <h1 className="sr-only">
        Spreadcast result for {prettyDay(day)}: {round.spread.toFixed(2)} euros per megawatt hour, {name}
      </h1>

      <div className="sc-result">
        <div className="sc-result-eyebrow">Settled result · SI day-ahead</div>
        <div className="sc-result-day">{prettyDay(day)}</div>

        <div className="sc-result-figure">
          <span className="sc-result-num num">{round.spread.toFixed(2)}</span>
          <span className="sc-result-unit">€/MWh</span>
        </div>

        <div
          className="sc-band-chip sc-result-band"
          style={{ "--bc": `var(${BAND_VARS[band]})` } as React.CSSProperties}
        >
          {name} · {label}
        </div>

        <p className="sc-result-lede">
          That is the gap between the highest and lowest hourly electricity price in Slovenia that day - the
          same number the batteries behind Megawatt earn on.
        </p>

        {/* The verification detail. This page is cited as evidence, so the
            things that make it checkable belong on it, not one link away. */}
        <dl className="sc-result-meta">
          <div>
            <dt>Bands</dt>
            <dd className="num">{round.boundaries.join(" · ")}</dd>
          </div>
          {round.source && (
            <div>
              <dt>Source</dt>
              {/* Third call site, and the one that gets shared. The other two
                  moved to sourceLabel() when "SIMULATED" was found stamped on
                  real market data; this one renders the raw field, so the page
                  strangers arrive at read "energy-charts" while the log said
                  "ENERGY-CHARTS" and the play view "ENTSO-E via Energy-Charts"
                  — one value, three presentations.

                  The lint rule added with that fix did not catch this: it
                  matches the TERNARY shape, which is the mistake I had just
                  made, not the raw render, which is the one I had missed. */}
              <dd>{sourceLabel(round.source)}</dd>
            </div>
          )}
          {round.resolution && (
            <div>
              <dt>Resolution</dt>
              <dd>{round.resolution}</dd>
            </div>
          )}
          {settled && (
            <div>
              <dt>Settled</dt>
              <dd>
                <time dateTime={settled.toISOString()}>
                  {settled.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
                </time>
              </dd>
            </div>
          )}
        </dl>

        <div className="sc-result-actions">
          <Link className="btn btn-accent" href="/spreadcast">
            Call tomorrow&apos;s spread
          </Link>
          <Link className="btn btn-ghost" href="/spreadcast/log">
            Every settled round
          </Link>
        </div>

        <p className="sc-result-foot">
          Spreadcast is free, has no purchase and no deposit, and one pick a day. Picks are committed before the
          auction that sets the price, and every round is published here afterwards.
        </p>
      </div>
    </>
  );
}
