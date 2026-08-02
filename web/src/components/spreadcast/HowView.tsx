import Link from "next/link";

export function HowView() {
  return (
    <>
      <h1>How it works</h1>
      <p className="sc-sub">
        A free daily forecasting game on the Slovenian day-ahead electricity market. No purchase necessary, ever.
      </p>

      <div className="sc-how-grid">
        <div className="panel sc-panel">
          <h2 className="sc-how-h">THE DAILY QUESTION</h2>
          <p>
            Every day, one question: <b>how big will tomorrow&apos;s electricity price swing be?</b>{" "}
            The swing is the gap between the day&apos;s highest and lowest hourly price on Slovenia&apos;s electricity
            market, in €/MWh.
          </p>
          <p className="prose-note" style={{ marginTop: 10 }}>
            You pick one of five bands, from Calm to Wild. Bands adjust every Monday to recent prices, so each one
            is roughly a 20% chance. Your edge is reading the weather, sunshine and demand. Pure skill.
          </p>
        </div>

        <div className="panel sc-panel">
          <h2 className="sc-how-h">THE CLOCK</h2>
          {/* Timezone stated once, not four times. Repeating it per row was
              both noise and a layout bug — "11:45 Ljubljana time" wrapped to
              three lines in a 92px column. */}
          <p className="sc-timeline-tz">All times Ljubljana · CET in winter, CEST in summer</p>
          <div className="sc-timeline">
            <div className="t"><b>15:00</b><span>Predictions open for the day after tomorrow.</span></div>
            {/* "the following day" is doing real work here. Read as a bare
                list the column runs 15:00 · 11:45 · ~13:00 · 15:00, which
                looks like predictions close six hours before they open. They
                do not: a round for delivery day X opens at 15:00 on X-2 and
                closes at 11:45 on X-1, so the only jump is a day boundary the
                list never mentioned. On the page whose whole job is explaining
                the rules — and on the one row that decides whether someone
                gets their pick in — that is worth four words. */}
            <div className="t"><b>11:45</b><span>Predictions close the following day, before the daily European electricity auction runs, so nobody can know the outcome.</span></div>
            <div className="t"><b>~13:00</b><span>Auction results publish.</span></div>
            <div className="t"><b>15:00</b><span>Results are scored automatically from the official published prices.</span></div>
          </div>
        </div>

        <div className="panel sc-panel">
          <h2 className="sc-how-h">SCORING</h2>
          <ul>
            <li><b>10 points</b> for the correct band.</li>
            <li>Streak multiplier: ×1.5 on day 2, growing to a <b>×3 cap</b> from day 5. Wrong pick or skipped day resets it.</li>
            <li>Optional exact-spread guess is the <b>tiebreaker</b>: lowest cumulative absolute error wins ties.</li>
            <li>Weekly and season leaderboards.</li>
          </ul>
        </div>

        <div className="panel sc-panel">
          <h2 className="sc-how-h">VERIFIED PLAY · XRPL</h2>
          <p>
            Anyone plays instantly with an email. Connecting an XRPL wallet (Xaman) makes you <b>verified</b>:
            required for the verified leaderboard and prize eligibility.
          </p>
          <ul style={{ marginTop: 10 }}>
            <li>Daily 1-drop signature to the platform anchor carries a salted hash of your forecast: a tamper-proof public commitment on XRPL mainnet.</li>
            <li>After settlement we reveal the salts, so anyone can verify every commitment.</li>
            <li>A weekly Merkle anchor transaction covers all players, including email-only.</li>
          </ul>
        </div>

        <div className="panel sc-panel">
          <h2 className="sc-how-h">PRIZES</h2>
          <p>
            A <b>$500 RLUSD prize pool</b> is split across the top 10 of the season leaderboard and paid out on
            XRPL (receiving RLUSD needs a trustline, one more real on-chain step). Prizes are promotional awards
            from the sponsoring entity. They are never a return on a payment, because there is no payment: entry is
            free in every configuration and the platform has no way to accept money from players.
          </p>
        </div>

        <div className="panel sc-panel">
          <h2 className="sc-how-h">FAIRNESS &amp; AUDIT</h2>
          <ul>
            <li>Settlement uses the officially published day-ahead prices (ENTSO-E A44, SI zone): final, no discretion.</li>
            <li>Since the market moved to 15-minute products, published values are aggregated to hourly means before computing the spread. Negative prices are handled naturally by max − min.</li>
            <li>Every delivery day&apos;s raw values, aggregation, spread, band and commit-reveal record are public in the archive.</li>
          </ul>
        </div>
      </div>

      {/* This page is 467 words and had no button and no link anywhere in it.
          Someone who reads to the end is the most convinced person in the
          product — and the page handed them tax handling and a legal notice,
          with the section bar at the very top as the only way forward.

          Placed BEFORE the fine print on purpose. The fine print is the right
          thing to end on legally and the wrong thing to end on persuasively,
          so the invitation goes where the conviction still is. */}
      <div className="sc-next-step">
        <div>
          <div className="sc-next-step-title">Ready to call one?</div>
          {/* Was "Tomorrow's round is open now", which this page's own CLOCK
              section contradicts twice over. That section says predictions open
              "for the day after tomorrow", so after 15:00 the open round is not
              tomorrow's; and predictions close at 11:45, so for the 3h15m until
              the next 15:00 no round is open at all. Static copy asserting a
              live state is wrong for part of every day.

              The schedule is the honest version of the same invitation — it is
              true at every hour, and it tells a reader when to come back rather
              than implying they are already late. Timezone repeated here on
              purpose: the CLOCK panel states it once, but this block sits well
              below it and has to stand on its own. */}
          <p className="sc-next-step-sub">
            One pick a day, free, no deposit. A new round opens every day at 15:00 Ljubljana time.
          </p>
        </div>
        <Link className="btn btn-accent" href="/spreadcast">
          Make a prediction
        </Link>
      </div>

      <div className="panel sc-panel" style={{ marginTop: 16 }}>
        <h2 className="sc-how-h">THE FINE PRINT</h2>
        <p className="sc-notice">
          Spreadcast is a free, skill-based promotional competition. 18+. No purchase necessary; no entry fee,
          deposits or staking exist anywhere in the product. Prizes are promotional awards from the sponsoring
          entity (final entity details pending company registration). Wallet addresses are treated as personal data
          under GDPR. This is a prototype: terms, privacy policy and prize tax handling land with the production
          release.
        </p>
      </div>
    </>
  );
}
