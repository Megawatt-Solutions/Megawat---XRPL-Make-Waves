"use client";
// Spreadcast play view: daily band pick → optional exact-spread tiebreaker →
// submit. Verified players additionally get the 1-drop commit transaction to
// sign (simulated locally until Xaman credentials are configured).

import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { fmtAddress } from "@/lib/format";
import { useRound } from "./RoundContext";
import { Sheet } from "../Sheet";

const BAND_VARS = ["--sc-b0", "--sc-b1", "--sc-b2", "--sc-b3", "--sc-b4"];

export function PlayView() {
  // Round state, the open/closed flag and the countdown all come from the
  // section layout now, so they survive navigation between the four routes.
  const { state, err, reload, isOpen } = useRound();
  const [sel, setSel] = useState<number | null>(null);
  const [exact, setExact] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // The Megawatt shell already owns wallet connection (Xaman handshake, QR,
  // deep link, watch-only fallback). Spreadcast consumes that state rather
  // than running a second connect flow — see docs/ui-ux-rehaul.md §4.
  const { connected, connecting, profile, connect: connectShellWallet } = useWallet();
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [acctMsg, setAcctMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [commit, setCommit] = useState<{ hash: string; signed: boolean; txHash?: string | null } | null>(null);
  // Real recent daily swings (SI market) — helps players calibrate.
  const [history, setHistory] = useState<{ day: string; swing: number }[]>([]);
  // Live Xaman signing of the daily commit (QR / deep link + polling).
  const [signFlow, setSignFlow] = useState<{ uuid: string; qrPng: string; deeplink: string; opened: boolean } | null>(null);

  // Mirror the server's stored pick into local form state. This used to live
  // inside reload(); the round fetch now belongs to the section layout, so react
  // to the resulting state instead of owning the request.
  useEffect(() => {
    if (!state?.mine) return;
    setSel(state.mine.band);
    setExact(state.mine.exact != null ? String(state.mine.exact) : "");
    // Simulated (demo-era) signatures don't count as signed — the real Xaman
    // flow can replace them until close.
    const realTx = state.mine.txHash && !state.mine.txHash.startsWith("SIMULATED-");
    setCommit((c) => c ?? { hash: state.mine!.hash, signed: !!realTx, txHash: state.mine!.txHash });
  }, [state]);

  useEffect(() => {
    fetch("/api/spreadcast/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHistory(Array.isArray(d.days) ? d.days : []))
      .catch(() => {});
  }, []);

  // ── Settlement announcement ────────────────────────────────────────────
  // Yesterday's result is the emotional peak of the loop, but it must not
  // re-announce itself on every visit for the rest of the day. Default to
  // "seen" so a returning player never gets a flash of the card before
  // localStorage is read. NB: these hooks must sit above the early returns
  // below — they cannot move down next to the render that uses them.
  const [resultSeen, setResultSeen] = useState(true);
  const [editing, setEditing] = useState(false);
  // Chart readouts — the touch-reachable replacement for hover tooltips.
  const [tip, setTip] = useState<string | null>(null);
  const [hourTip, setHourTip] = useState<string | null>(null);
  const [showFair, setShowFair] = useState(false);
  const latestDay = state?.latest?.day ?? null;
  const hasMyResult = !!state?.latest?.mine;
  useEffect(() => {
    if (!latestDay || !hasMyResult) return;
    try {
      setResultSeen(localStorage.getItem(`mw.sc.seen.${latestDay}`) === "1");
    } catch {
      setResultSeen(false); // private mode — show it, just don't remember
    }
  }, [latestDay, hasMyResult]);
  const dismissResult = () => {
    if (latestDay) {
      try {
        localStorage.setItem(`mw.sc.seen.${latestDay}`, "1");
      } catch {
        /* non-fatal */
      }
    }
    setResultSeen(true);
  };

  const join = async () => {
    setBusy(true);
    setAcctMsg(null);
    const res = await fetch("/api/spreadcast/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setAcctMsg({ kind: "err", text: data.error });
    reload();
  };

  // Bind the address the shell already proved to this Spreadcast session.
  // Same endpoint the manual r-address input used to call — the only change
  // is where the address comes from, so no API or connector change is needed.
  const linkWallet = async (address: string) => {
    if (!address) return;
    setBusy(true);
    setAcctMsg(null);
    const res = await fetch("/api/spreadcast/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setAcctMsg({ kind: "err", text: data.error });
    setAcctMsg({ kind: "ok", text: data.note ?? "Wallet linked — you're verified." });
    reload();
  };

  const submit = async () => {
    if (sel == null) return setMsg({ kind: "err", text: "Pick a band first." });
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/spreadcast/predict", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ band: sel, exact: exact.trim() === "" ? null : Number(exact) }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "err", text: data.error });
    setCommit({ hash: data.prediction.hash, signed: false });
    setMsg({ kind: "ok", text: "Prediction locked in — you can change it until close." });
    setEditing(false); // collapse back to the status strip
    reload();
  };

  // Real Xaman signing: server wraps the 1-drop commit Payment (anchor
  // destination, Make Waves SourceTag, hash memo) in a Xaman payload.
  const startSign = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/spreadcast/commit-sign", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.status === 501) return simulateSign(); // no XUMM keys → demo path
    if (!res.ok) return setMsg({ kind: "err", text: data.error });
    setSignFlow({ uuid: data.uuid, qrPng: data.qrPng, deeplink: data.deeplink, opened: false });
  };

  const signUuid = signFlow?.uuid;
  const signDay = isOpen ? (state!.open as { day: string }).day : null;
  useEffect(() => {
    if (!signUuid || !signDay) return;
    let alive = true;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/spreadcast/commit-sign?uuid=${signUuid}&day=${signDay}`, { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        if (!alive) return;
        if (s.signed && s.txHash) {
          clearInterval(iv);
          setSignFlow(null);
          setCommit((c) => (c ? { ...c, signed: true, txHash: s.txHash } : c));
          setMsg({ kind: "ok", text: "Locked — your prediction is now on XRPL mainnet." });
        } else if (s.cancelled || s.expired) {
          clearInterval(iv);
          setSignFlow(null);
          setMsg({ kind: "err", text: s.expired ? "Sign request expired — try again." : "Sign request declined in Xaman." });
        } else if (s.opened) {
          setSignFlow((f) => (f ? { ...f, opened: true } : f));
        }
      } catch {
        // transient — keep polling
      }
    }, 2500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [signUuid, signDay]);

  // Demo-mode stand-in for the Xaman sign flow: reports a simulated tx hash.
  const simulateSign = async () => {
    if (!commit || !state?.mine) return;
    setBusy(true);
    const day = (state.open as { day: string }).day;
    const fakeTx = `SIMULATED-${commit.hash.slice(0, 16).toUpperCase()}`;
    await fetch("/api/spreadcast/predict", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day, txHash: fakeTx }),
    });
    setBusy(false);
    setCommit({ ...commit, signed: true });
    setMsg({ kind: "ok", text: "Commit signature recorded (simulated — Xaman signing arrives with API keys)." });
  };

  if (err)
    return (
      <div className="panel sc-panel">
        <span className="tick tl" />
        <span className="tick tr" />
        <span className="tick bl" />
        <span className="tick br" />
        <h2>Market feed unavailable</h2>
        <p className="sc-notice">
          {err}
          {" "}
          Today&apos;s round can&apos;t be loaded right now — the rest of Megawatt is unaffected.
        </p>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 14 }}
          onClick={reload}
        >
          Try again
        </button>
      </div>
    );

  // Mirrors the real Play layout — headline, round panel, five band rows, CTA
  // — so the page holds its shape instead of collapsing to one line and
  // snapping back. This is the surface people land on most.
  if (!state)
    return (
      <div aria-busy="true" aria-live="polite" aria-label="Loading today's round">
        <div className="skel skel-line lg w80" style={{ marginBottom: 14 }} />
        <div className="skel skel-line w60" style={{ marginBottom: 24 }} />
        <div className="panel sc-panel">
          <span className="tick tl" />
          <span className="tick tr" />
          <span className="tick bl" />
          <span className="tick br" />
          <div className="skel skel-line w40" style={{ marginBottom: 18 }} />
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="skel skel-row" />
          ))}
          <div className="skel skel-cta" />
        </div>
      </div>
    );

  const bands = isOpen
    ? (state.open as { bands: { i: number; name: string; label: string }[] }).bands
    : null;
  const latest = state.latest;

  // A pick exists for the open round and we're not currently changing it.
  const locked = !!state.mine && isOpen && !editing;

  // Identity, stated honestly. The shell knowing an address is NOT the same as
  // the game session having one bound — rendering "connected" off shell state
  // alone would claim a binding that doesn't exist. Three states only:
  //   shellAddress && !gameWallet  -> connected but unlinked (offer one tap)
  //   gameWallet === shellAddress  -> linked
  //   gameWallet !== shellAddress  -> mismatched (say so; don't silently rebind)
  const shellAddress = connected && profile ? profile.address : null;
  const gameWallet = state.user?.wallet ?? null;
  const mismatched = !!gameWallet && !!shellAddress && gameWallet !== shellAddress;

  const hourlyMin = latest ? Math.min(...latest.hourly) : 0;
  const hourlyMax = latest ? Math.max(...latest.hourly) : 1;

  // Band helpers against the boundaries of the round being played.
  const activeBounds = isOpen ? (state.open as { boundaries: number[] }).boundaries : state.boundaries;
  const bandOfSwing = (v: number) => {
    for (let i = 0; i < activeBounds.length; i++) if (v < activeBounds[i]) return i;
    return activeBounds.length;
  };
  const histMax = history.length ? Math.max(...history.map((h) => h.swing)) : 1;
  const BAND_NAMES = ["Calm", "Steady", "Lively", "Swingy", "Wild"];
  const shortDay = (d: string) => {
    const [, m, dd] = d.split("-");
    return `${Number(dd)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]}`;
  };
  const histAvg = history.length ? history.reduce((a, h) => a + h.swing, 0) / history.length : 0;
  const bandHits = [0, 1, 2, 3, 4].map(
    (i) => history.filter((h) => bandOfSwing(h.swing) === i).length
  );

  // Announce a settled result once, above everything else. Renders entirely
  // from /round's `latest` — no extra fetch, no new endpoint.
  const showSettlement = !!latest?.mine && !resultSeen;

  const realTx = commit?.txHash && !commit.txHash.startsWith("SIMULATED-") ? commit.txHash : null;

  return (
    <>
      {/* The credibility argument, explained with the player's own values
          rather than left as a hex string in a dashed box. */}
      <Sheet
        open={showFair}
        onClose={() => setShowFair(false)}
        eyebrow="Provably fair"
        title="How you know we can't move the goalposts"
      >
        <p style={{ marginBottom: 4 }}>
          Spreadcast never decides who wins. The result comes from the official European day-ahead auction, and your
          pick is sealed before that auction runs.
        </p>
        <div className="pf-steps">
          <div className="pf-step">
            <div>
              <div className="pf-step-title">You pick a band</div>
              <div className="pf-step-body">
                Before 11:45 Ljubljana time — hours before the auction that decides tomorrow&apos;s prices.
              </div>
            </div>
          </div>
          <div className="pf-step">
            <div>
              <div className="pf-step-title">Your pick is fingerprinted</div>
              <div className="pf-step-body">
                We hash your band and a secret salt with SHA-256. The hash proves what you chose without revealing it,
                so nobody — including us — can change it afterwards.
                {commit && <span className="pf-value">{commit.hash}</span>}
              </div>
            </div>
          </div>
          <div className="pf-step">
            <div>
              <div className="pf-step-title">The fingerprint goes on XRPL</div>
              <div className="pf-step-body">
                {realTx ? (
                  <>
                    Written to the public ledger, timestamped and immutable.
                    <a
                      className="pf-value"
                      href={`https://livenet.xrpl.org/transactions/${realTx}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      {realTx} ↗
                    </a>
                  </>
                ) : state.user?.verified ? (
                  <>
                    Verified players sign a 1-drop payment carrying the hash, so the timestamp is the ledger&apos;s, not
                    ours.
                    <span className="pf-value pending">Not signed for this round yet.</span>
                  </>
                ) : (
                  <>
                    Email-only players are covered by a weekly Merkle anchor instead — one root covering every
                    prediction that week, written to XRPL. Link a wallet to get your own per-round transaction.
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="pf-step">
            <div>
              <div className="pf-step-title">After settlement, everything is revealed</div>
              <div className="pf-step-body">
                The salt is published under Results, so anyone can re-hash your pick and check it matches the
                fingerprint that was on-chain before the prices existed.
              </div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Prices come from the ENTSO-E transparency platform — the same published data the market settles on.
        </p>
      </Sheet>

      {showSettlement && latest?.mine && (
        <div className={`sc-settle${latest.mine.correct ? " hit" : ""}`} role="status">
          <div className="sc-settle-head">
            <span className="caps">
              {latest.mine.correct ? "You called it" : "Not this time"} · {latest.day}
            </span>
            <button className="sc-settle-x" onClick={dismissResult} aria-label="Dismiss result">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="sc-settle-num">
            {latest.spread.toFixed(2)}
            <small>€/MWh</small>
          </div>
          <div className="sc-settle-meta">
            <span
              className="sc-band-chip"
              style={{ "--bc": `var(${BAND_VARS[latest.outcomeBand]})` } as React.CSSProperties}
            >
              {latest.outcomeLabel}
            </span>
            {latest.mine.correct ? (
              <span className="sc-settle-pts">
                +{latest.mine.points} pts · streak {latest.mine.streak}
              </span>
            ) : (
              <span className="muted">you called {BAND_NAMES[latest.mine.band]}</span>
            )}
          </div>
        </div>
      )}

      <div className="sc-play-top">
        <div>
          <h1>
            How <span>wild</span> will electricity prices get tomorrow?
          </h1>
          <p className="sc-sub" style={{ marginBottom: 0 }}>
            Slovenia&apos;s electricity price changes every hour. Predict how big the swing between the day&apos;s
            highest and lowest price will be{isOpen ? ` on ${(state.open as { day: string }).day}` : ""} — free to
            play, every day.
          </p>
        </div>
        {/* The countdown lives in the section bar now — it's sticky, so it is
            on screen whenever this would have been, and it keeps ticking
            across tab changes. A second larger copy directly beneath it was
            pure duplication, and cost vertical space we don't have on a
            phone. See docs/ui-ux-rehaul.md §2.1. */}
      </div>

      <div className="sc-play-grid">
        <div>
          {isOpen && bands ? (
            <div className="panel sc-panel">
              <span className="tick tl" />
              <span className="tick tr" />
              <span className="tick bl" />
              <span className="tick br" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ marginBottom: 0 }}>Round · {(state.open as { day: string }).day}</h2>
                <span className="sc-pill">
                  {(state.open as { participants: number }).participants} predictions in
                </span>
              </div>

              {/* Today's pick is in: show it as a settled status strip rather
                  than a live picker, so "done" actually reads as done. The
                  shipped API still allows changes until close, so the action
                  says "Change pick" — a locked-forever screen would be a game
                  rule we don't have. See docs/ui-ux-rehaul.md §3. */}
              {locked && (
                <div className="sc-locked">
                  <span
                    className="sc-locked-chip"
                    style={{ background: `var(${BAND_VARS[state.mine!.band]})` }}
                    aria-hidden="true"
                  />
                  <div className="sc-locked-id">
                    <div className="sc-locked-band">{BAND_NAMES[state.mine!.band]}</div>
                    <div className="sc-locked-range">
                      {bands[state.mine!.band]?.label} €/MWh
                      {state.mine!.exact != null && ` · exact ${state.mine!.exact}`}
                    </div>
                  </div>
                  <span className="sc-pill ok">Locked</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                    Change pick
                  </button>
                </div>
              )}

              {!locked && (
                <>
              {/* Radio group, not a list of divs. This is the game's primary
                  interaction and it was a <div onClick> — unreachable by
                  keyboard, invisible to assistive tech, and with no pressed
                  state to announce. */}
              <div className="sc-bands" role="radiogroup" aria-label="Predicted spread band">
                {bands.map((b) => (
                  <button
                    type="button"
                    key={b.i}
                    role="radio"
                    aria-checked={sel === b.i}
                    aria-label={`${b.name}, ${b.label} euro per megawatt hour`}
                    className={`sc-band-card${sel === b.i ? " sel" : ""}`}
                    style={{ "--bc": `var(${BAND_VARS[b.i]})` } as React.CSSProperties}
                    onClick={() => setSel(b.i)}
                  >
                    <span className="sc-band-bar" />
                    <div className="sc-band-name">{b.name}</div>
                    <div className="sc-band-range">{b.label}</div>
                    <div className="sc-band-unit">€/MWh</div>
                    {history.length > 0 && (
                      <div className="sc-band-hint">
                        {Math.round((bandHits[b.i] / history.length) * 100)}% of last {history.length}d
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="sc-exact-row">
                {/* htmlFor, not a bare <label>. Without it this was a label
                    element attached to nothing: the input had no accessible
                    name, and clicking the words did not focus the field. */}
                <label className="muted" style={{ fontSize: 13 }} htmlFor="sc-exact">
                  Exact swing (optional tiebreaker):
                </label>
                <input
                  id="sc-exact"
                  className="sc-field sc-mono"
                  placeholder="e.g. 92.5"
                  inputMode="decimal"
                  value={exact}
                  onChange={(e) => setExact(e.target.value)}
                />
                <span className="muted" style={{ fontSize: 12 }}>€/MWh</span>
              </div>
              {/* On mobile this docks flush against the bottom tab bar, so the
                  CTA and the nav read as one assembly rather than a button
                  colliding with chrome. Static on desktop. */}
              {state.user ? (
                <div className="sc-cta-dock">
                  <button className="btn btn-accent btn-block" onClick={submit} disabled={busy || sel == null}>
                    {state.mine ? "Update prediction" : "Lock in prediction"}
                  </button>
                </div>
              ) : (
                <p className="sc-notice">Join with your email in the panel below — it takes five seconds.</p>
              )}
                </>
              )}
              {msg && <p className={msg.kind === "err" ? "sc-err" : "sc-notice"} style={{ marginTop: 10 }}>{msg.text}</p>}

              {commit && state.user && (
                <div className="sc-commit-box">
                  <div className="sc-commit-head">
                    <span>PREDICTION FINGERPRINT · SHA-256</span>
                    <button type="button" className="sc-commit-why" onClick={() => setShowFair(true)}>
                      Why this matters
                    </button>
                  </div>
                  {commit.hash}
                  {state.user.verified && (
                    <div style={{ marginTop: 8 }}>
                      {commit.signed ? (
                        <span style={{ color: "var(--accent)" }}>
                          ✓ locked on XRPL mainnet
                          {commit.txHash && !commit.txHash.startsWith("SIMULATED-") && (
                            <>
                              {" · "}
                              <a
                                href={`https://livenet.xrpl.org/transactions/${commit.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: "var(--accent)", textDecoration: "underline" }}
                              >
                                view on ledger
                              </a>
                            </>
                          )}
                        </span>
                      ) : signFlow ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={signFlow.qrPng} alt="Xaman commit QR" width={124} height={124} style={{ background: "#fff", padding: 5 }} />
                          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                            <span style={{ color: "var(--text-2)" }}>
                              {signFlow.opened ? "Opened in Xaman — approve to commit" : "Scan with Xaman to lock your prediction on-chain"}
                            </span>
                            <a className="btn btn-ghost btn-sm" href={signFlow.deeplink} target="_blank" rel="noreferrer">
                              Open in Xaman app
                            </a>
                            <button
                              onClick={() => setSignFlow(null)}
                              style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}
                            >
                              cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={startSign} disabled={busy}>
                          Lock on-chain with Xaman (1 drop)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="panel sc-panel">
              <h2>Between rounds</h2>
              <p className="sc-notice">
                Today&apos;s results are being tallied.{" "}
                {(state.open as { nextDay?: string })?.nextDay
                  ? `Predictions for ${(state.open as { nextDay: string }).nextDay} open at 15:00.`
                  : "The next round opens at 15:00."}
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="panel sc-panel" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ marginBottom: 0 }}>Recent swings · last {history.length} days</h2>
                <span className="sc-pill">real market data</span>
              </div>
              {/* Tap/hover updates the readout below rather than firing a
                  tooltip. A hover tooltip is invisible on touch, and making
                  60 bars individually focusable would add 60 tab stops — a
                  single caption is reachable, readable and announces once. */}
              <div
                className="sc-hist"
                onPointerDown={(e) => {
                  const t = (e.target as HTMLElement).closest("[data-tip]");
                  if (t) setTip(t.getAttribute("data-tip"));
                }}
                onPointerLeave={() => setTip(null)}
              >
                {history.map((h) => (
                  <span
                    key={h.day}
                    className="sc-bar-tip"
                    data-tip={`${shortDay(h.day)} · ${h.swing.toFixed(0)} €/MWh · ${BAND_NAMES[bandOfSwing(h.swing)]}`}
                    onPointerEnter={(e) => setTip(e.currentTarget.getAttribute("data-tip"))}
                    style={{
                      height: `${8 + (h.swing / histMax) * 90}%`,
                      background: `var(${BAND_VARS[bandOfSwing(h.swing)]})`,
                    }}
                  />
                ))}
              </div>
              <div className="sc-readout" role="status" aria-live="polite">
                {tip ?? `Last ${history.length} days · tap a bar for the day`}
              </div>
              <div className="sc-hist-stats">
                <span className="sc-mono muted">avg {histAvg.toFixed(0)} €/MWh</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="sc-mono" style={{ color: `var(${BAND_VARS[i]})` }}>
                    {["Calm", "Steady", "Lively", "Swingy", "Wild"][i]} {Math.round((bandHits[i] / history.length) * 100)}%
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                daily price swings on the Slovenian market · colored by today&apos;s bands · data: ENTSO-E via
                Energy-Charts
              </p>
            </div>
          )}

          {latest && (
            <div className="panel sc-panel" style={{ marginTop: 16 }}>
              <h2>Latest result · {latest.day}</h2>
              <div className="sc-result-strip">
                <div>
                  <div className="sc-result-num">{latest.spread.toFixed(2)} €</div>
                  <div className="muted" style={{ fontSize: 12 }}>price swing</div>
                </div>
                <span
                  className="sc-band-chip"
                  style={{ "--bc": `var(${BAND_VARS[latest.outcomeBand]})` } as React.CSSProperties}
                >
                  {latest.outcomeLabel}
                </span>
                <span className="sc-pill">{latest.source === "entsoe" ? "ENTSO-E A44" : "SIMULATED FEED"}</span>
                {latest.mine &&
                  (latest.mine.correct ? (
                    <span className="sc-pill ok">
                      ✓ you called it · +{latest.mine.points} pts · streak {latest.mine.streak}
                    </span>
                  ) : (
                    <span className="sc-pill">your pick missed — streak reset</span>
                  ))}
              </div>
              <div
                className="sc-spark"
                onPointerDown={(e) => {
                  const t = (e.target as HTMLElement).closest("[data-tip]");
                  if (t) setHourTip(t.getAttribute("data-tip"));
                }}
                onPointerLeave={() => setHourTip(null)}
              >
                {latest.hourly.map((v, i) => {
                  const t = (v - hourlyMin) / (hourlyMax - hourlyMin || 1);
                  return (
                    <span
                      key={i}
                      className="sc-bar-tip"
                      data-tip={`${String(i).padStart(2, "0")}:00 · ${v.toFixed(2)} €/MWh`}
                      onPointerEnter={(e) => setHourTip(e.currentTarget.getAttribute("data-tip"))}
                      style={{
                        height: `${6 + t * 92}%`,
                        background: v < 0 ? "var(--sc-b0)" : `color-mix(in srgb, var(--sc-b4) ${Math.round(t * 100)}%, var(--sc-b1))`,
                      }}
                    />
                  );
                })}
              </div>
              <div className="sc-readout" role="status" aria-live="polite">
                {hourTip ?? "Hourly prices, 00–23 · tap a bar for the hour"}
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                blue = price went negative · full details under Results
              </p>
            </div>
          )}
        </div>

        <div className="sc-side-stack">
          {!state.user ? (
            <div className="panel sc-panel">
              <h2>Join free</h2>
              <p className="sc-notice" style={{ marginBottom: 12 }}>
                Email only — instant play. No purchase, no deposits, ever.
              </p>
              {/* A real <form>, so Enter submits — this is a two-field signup
                  and reaching for the mouse to finish it is a needless step.
                  It also lets password managers recognise the flow, which two
                  bare inputs and a click handler never could.

                  The labels are visible rather than placeholders. A
                  placeholder is not a label: it fails to name the field for
                  assistive tech, and it disappears the moment someone starts
                  typing — taking away the only cue at exactly the point they
                  might want to check it. */}
              <form
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
                onSubmit={(e) => { e.preventDefault(); if (!busy) join(); }}
              >
                <div>
                  <label className="field-label" htmlFor="sc-join-email">Email</label>
                  <input
                    id="sc-join-email"
                    className="sc-field"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="sc-join-name">Display name</label>
                  <input
                    id="sc-join-name"
                    className="sc-field"
                    name="name"
                    autoComplete="nickname"
                    placeholder="shown on the leaderboard"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <button className="btn btn-accent" type="submit" disabled={busy}>
                  Start playing
                </button>
                {shellAddress && (
                  // Don't imply the connected wallet already plays — /join is
                  // email-based. Just set the expectation honestly.
                  <p className="sc-notice" style={{ fontSize: 12 }}>
                    You&apos;re connected as <span className="sc-mono">{fmtAddress(shellAddress)}</span> — you can link
                    it right after, to become prize-eligible.
                  </p>
                )}
                {acctMsg && <p className={acctMsg.kind === "err" ? "sc-err" : "sc-notice"}>{acctMsg.text}</p>}
              </form>
            </div>
          ) : (
            <div className="panel sc-panel">
              <h2>
                {state.user.name} {state.user.verified && <span className="sc-tag v">VERIFIED</span>}
              </h2>
              <p className="sc-notice">{state.user.email}</p>
              {!state.user.verified ? (
                <>
                  <p className="sc-notice" style={{ margin: "10px 0" }}>
                    Link an XRPL wallet to join the verified leaderboard and become prize-eligible. Your daily
                    prediction then gets locked on-chain — tamper-proof.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {shellAddress ? (
                      // Connected in the header but not bound here yet. One tap,
                      // no retyping — the address is already proven by the shell.
                      <>
                        <div className="sc-wallet-row">
                          <span className="dot" style={{ background: "var(--accent)" }} />
                          <span className="sc-mono" style={{ flex: 1, minWidth: 0 }}>
                            {fmtAddress(shellAddress)}
                          </span>
                          <span className="sc-pill">in wallet</span>
                        </div>
                        <button className="btn btn-accent" onClick={() => linkWallet(shellAddress)} disabled={busy}>
                          {busy ? "Linking…" : "Link this wallet"}
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-ghost" onClick={connectShellWallet} disabled={connecting}>
                        {connecting ? "Connecting…" : "Connect wallet"}
                      </button>
                    )}
                    {acctMsg && <p className={acctMsg.kind === "err" ? "sc-err" : "sc-notice"}>{acctMsg.text}</p>}
                  </div>
                </>
              ) : (
                <>
                  <p className="sc-notice" style={{ marginTop: 8 }}>
                    <span className="sc-mono">{state.user.wallet}</span>
                    <br />
                    Your predictions are locked on-chain with tiny 1-drop payments.
                  </p>
                  {mismatched && (
                    <div style={{ marginTop: 12 }}>
                      <p className="sc-err">
                        The wallet in your header ({fmtAddress(shellAddress!)}) isn&apos;t the one linked here.
                        Predictions stay bound to the linked address.
                      </p>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 8 }}
                        onClick={() => linkWallet(shellAddress!)}
                        disabled={busy}
                      >
                        {busy ? "Linking…" : "Link the header wallet instead"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="panel sc-panel">
            <h2>This week&apos;s bands</h2>
            <p className="sc-notice" style={{ marginBottom: 10 }}>
              Bands adjust every Monday to recent prices, so each one is roughly a 20% chance. Skill is reading
              the weather, sunshine and demand.
            </p>
            {[0, 1, 2, 3, 4].map((i) => {
              const b = state.boundaries;
              const label = i === 0 ? `< ${b[0]}` : i === 4 ? `≥ ${b[3]}` : `${b[i - 1]} – ${b[i]}`;
              const names = ["Calm", "Steady", "Lively", "Swingy", "Wild"];
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                  <span style={{ color: `var(${BAND_VARS[i]})`, fontWeight: 700 }}>{names[i]}</span>
                  <span className="sc-mono muted">{label} €/MWh</span>
                </div>
              );
            })}
          </div>

          <div className="panel sc-panel">
            <h2>Prizes</h2>
            <p className="sc-notice">
              <b style={{ color: "var(--accent)" }}>$500 RLUSD prize pool</b> — split across the top 10 of the
              season leaderboard, paid on XRPL. Entry is always free; prizes are promotional awards from the
              sponsor, never a return on anything you paid.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
