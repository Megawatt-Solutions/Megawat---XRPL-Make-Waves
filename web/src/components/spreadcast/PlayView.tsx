"use client";
// Spreadcast play view: daily band pick → optional exact-spread tiebreaker →
// submit → sign the 1-drop commit in Xaman. A pick counts only once its commit
// tx is observed on the ledger; until then it renders as pending.

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { fmtAddress } from "@/lib/format";
import { useRound } from "./RoundContext";
import { Sheet } from "../Sheet";
import { sourceLabel } from "./sourceLabel";

const BAND_VARS = ["--sc-b0", "--sc-b1", "--sc-b2", "--sc-b3", "--sc-b4"];

export function PlayView() {
  // Round state, the open/closed flag and the countdown all come from the
  // section layout now, so they survive navigation between the four routes.
  const { state, err, reload, isOpen } = useRound();
  const [sel, setSel] = useState<number | null>(null);
  // Roving focus for the band radiogroup. role="radio" is a promise about the
  // keyboard, and only the roles had been written: measured with trusted key
  // events, four ArrowRight presses left focus on "Calm" and checked nothing,
  // while all five radios sat in the tab order. A screen reader announces
  // "radio group, 1 of 5", the user presses an arrow, and nothing happens.
  const bandRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [exact, setExact] = useState("");
  // The tiebreaker was sent as `Number(exact)`, and JSON.stringify turns NaN
  // into null — so "abc" left the browser as no tiebreaker at all, with nothing
  // said. A tiebreaker is what settles a tie on the leaderboard, so silently
  // dropping it costs the player the tie they thought they had covered.
  // "-50" went through untouched, and a swing is a day's high minus its low:
  // it cannot be negative.
  // Empty stays valid — the field is optional and says so.
  const exactTrimmed = exact.trim();
  const exactInvalid =
    exactTrimmed !== "" && !(Number.isFinite(Number(exactTrimmed)) && Number(exactTrimmed) >= 0);
  const [busy, setBusy] = useState(false);
  // The Megawatt shell already owns wallet connection (Xaman handshake, QR,
  // deep link, watch-only fallback). Spreadcast consumes that state rather
  // than running a second connect flow — see docs/ui-ux-rehaul.md §4.
  const { connected, connecting, profile, connect: connectShellWallet, openNamePrompt } = useWallet();
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
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
  // Both edges of this toggle destroy the control that was focused, and focus
  // fell to <body> each time — measured after clicking "Change pick":
  // activeElement was BODY. A keyboard or screen-reader player activates the
  // button, the button ceases to exist, and they are returned to the top of the
  // document with no idea the picker opened.
  // Entering: the checked band, because changing it is why they pressed it.
  // Leaving: the button they will have come back to the strip to press again.
  const changePickRef = useRef<HTMLButtonElement | null>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    // Only on the transitions, never on mount: `editing` starts false, and a
    // bare `if (!editing)` here would grab focus on first paint.
    // sel is the band index and bandRefs is keyed by it, so no lookup is
    // needed — and this must not depend on `bands`, which is computed after an
    // early return and so cannot be read from a hook.
    if (editing && !wasEditing.current) bandRefs.current[sel ?? 0]?.focus();
    else if (!editing && wasEditing.current) changePickRef.current?.focus();
    wasEditing.current = editing;
  }, [editing, sel]);
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
      setResultSeen(false); // private mode - show it, just don't remember
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

  // Both network calls below parse JSON before they know they have JSON. An
  // infrastructure 502 answers in HTML and a dropped connection rejects
  // outright, and either one threw past setBusy(false) — leaving `busy` true
  // for the life of the page, with the submit and sign buttons disabled on it.
  // The finally is what guarantees the buttons come back.
  const readJson = async (res: Response) => {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  };

  const submit = async () => {
    if (sel == null) return setMsg({ kind: "err", text: "Pick a band first." });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/spreadcast/predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ band: sel, exact: exact.trim() === "" ? null : Number(exact) }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setMsg({ kind: "err", text: (data.error as string) ?? "Could not save your prediction." });
        // The one refusal with a remedy: a session exists but has no nickname,
        // which happens after "Choose later". Without this the player reads
        // "Choose a nickname first." beside no control that chooses one, and
        // the only way back is disconnecting and re-signing in Xaman.
        if (data.code === "nickname_required") openNamePrompt();
        // A 502 can mean "stored as pending but Xaman was unreachable" — the
        // pick exists server-side, so re-fetch truth instead of rendering the
        // form as if nothing was saved. Harmless refresh on every other error.
        reload();
        return;
      }
      const prediction = data.prediction as { hash: string };
      setCommit({ hash: prediction.hash, signed: false });
      // The predict route creates the Xaman payload in the same response, so
      // signing starts immediately — a stored-but-unsigned pick does not count,
      // and parking the player on a bare success message would hide that.
      const sign = data.sign as { uuid: string; qrPng: string; deeplink: string } | undefined;
      if (sign) {
        setSignFlow({ uuid: sign.uuid, qrPng: sign.qrPng, deeplink: sign.deeplink, opened: false });
      }
      setMsg({ kind: "ok", text: "Prediction saved - now sign the 1-drop commit in Xaman. It doesn't count until it's on-chain." });
      setEditing(false); // collapse back to the status strip
      reload();
    } catch {
      setMsg({ kind: "err", text: "Could not reach the game API. Your pick was not saved - try again." });
    } finally {
      setBusy(false);
    }
  };

  // Re-opens a sign request for the stored pending pick (the payload from
  // submit expires after 5 minutes, or the player may have cancelled it).
  const startSign = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/spreadcast/commit-sign", { method: "POST" });
      const data = await readJson(res);
      if (!res.ok) {
        setMsg({ kind: "err", text: (data.error as string) ?? "Xaman signing is unavailable right now." });
        // 409 is "already signed" — the strip is showing a pending state the
        // server has moved past, so take its word for it rather than leaving
        // the player looking at an error beside a stale "not signed".
        if (res.status === 409) reload();
        return;
      }
      setSignFlow({
        uuid: data.uuid as string,
        qrPng: data.qrPng as string,
        deeplink: data.deeplink as string,
        opened: false,
      });
    } catch {
      setMsg({ kind: "err", text: "Could not reach Xaman - try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const signUuid = signFlow?.uuid;
  const signDay = isOpen ? (state!.open as { day: string }).day : null;

  // Signing means leaving the browser for the Xaman app, and on a phone iOS
  // and Android both discard the backgrounded tab freely. The sign flow lived
  // only in component state, so coming back to a reloaded page showed
  // "Pending - not signed" for a commit that was signed or in flight, and the
  // obvious next move — press the button again — mints a SECOND payload and
  // can put a second 1-drop Payment on the ledger for one prediction.
  // Persisting the payload lets the same one resume instead.
  const SIGN_KEY = "mw.sc.signFlow";
  useEffect(() => {
    if (!signDay) return;
    try {
      const raw = sessionStorage.getItem(SIGN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { day: string; uuid: string; qrPng: string; deeplink: string };
      // Only for the round now open — yesterday's payload is not resumable.
      if (saved.day !== signDay) return sessionStorage.removeItem(SIGN_KEY);
      setSignFlow((f) => f ?? { uuid: saved.uuid, qrPng: saved.qrPng, deeplink: saved.deeplink, opened: false });
    } catch {
      // unparseable or storage blocked — fall through to the normal flow
    }
  }, [signDay]);

  useEffect(() => {
    if (!signDay) return;
    try {
      if (signFlow) {
        sessionStorage.setItem(SIGN_KEY, JSON.stringify({ day: signDay, ...signFlow }));
      } else {
        sessionStorage.removeItem(SIGN_KEY);
      }
    } catch {
      // private mode — resuming is a nicety, not a correctness requirement
    }
  }, [signFlow, signDay]);

  // Returning from the Xaman app is the moment the answer changes, and the
  // poll below only runs while a payload is open. Re-reading the round on
  // re-focus is what makes a commit signed in the app show as signed here.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

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
          setMsg({ kind: "ok", text: "Locked - your prediction is now on XRPL mainnet." });
        } else if (s.cancelled || s.expired) {
          clearInterval(iv);
          setSignFlow(null);
          setMsg({ kind: "err", text: s.expired ? "Sign request expired. Try again." : "Sign request declined in Xaman." });
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
          Today&apos;s round can&apos;t be loaded right now - the rest of Megawatt is unaffected.
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
  // A pick counts only once its commit tx is on the ledger. Derived from
  // state.mine directly (not just `commit`) so a signed pick never flashes
  // "pending" during the frame before the mirror effect runs. SIMULATED-
  // hashes are demo-era rows the worker also excludes from scoring.
  const mineOnChain = !!state.mine?.txHash && !state.mine.txHash.startsWith("SIMULATED-");
  const pickSigned = !!commit?.signed || mineOnChain;

  // Identity, stated honestly. The shell knowing an address is NOT the same as
  // the game session having one — a session exists only after a Xaman SignIn
  // is verified server-side, so watch-only browsing never creates one. Three
  // states only:
  //   shellAddress && !state.user  -> browsing only (watch-only proves nothing)
  //   gameWallet === shellAddress  -> signed in
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
                Before 11:45 Ljubljana time - hours before the auction that decides tomorrow&apos;s prices.
              </div>
            </div>
          </div>
          <div className="pf-step">
            <div>
              <div className="pf-step-title">Your pick is fingerprinted</div>
              <div className="pf-step-body">
                We hash your band and a secret salt with SHA-256. The hash proves what you chose without revealing it,
                so nobody - including us - can change it afterwards.
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
                ) : (
                  <>
                    You sign a 1-drop payment in Xaman carrying the hash, so the timestamp is the ledger&apos;s, not
                    ours.
                    <span className="pf-value pending">Not signed for this round yet - an unsigned pick doesn&apos;t count.</span>
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
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          Prices come from the ENTSO-E transparency platform - the same published data the market settles on.
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
            highest and lowest price will be{isOpen ? ` on ${(state.open as { day: string }).day}` : ""}. Free to
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
                {/* The worker counts only picks whose commit tx is on the
                    ledger, so the label must claim exactly that — "predictions
                    in" would count differently than the number shown. */}
                <span className="sc-pill">
                  {(state.open as { participants: number }).participants} locked on-chain
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
                  {pickSigned ? (
                    <span className="sc-pill ok">Locked on-chain</span>
                  ) : (
                    <span className="sc-pill">Pending · not signed</span>
                  )}
                  <button ref={changePickRef} className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                    Change pick
                  </button>
                </div>
              )}

              {!locked && (
                <>
              {/* Radio group, not a list of divs. This is the game's primary
                  interaction and it was a <div onClick> — unreachable by
                  keyboard, invisible to assistive tech, and with no pressed
                  state to announce.

                  The roving tabIndex below is the other half of that role. A
                  radiogroup means: Tab reaches the current choice, arrows move
                  between choices, Tab leaves. Only the roles had been written,
                  so Tab stepped through all five — operable, but not what the
                  role announces — and the arrows the announcement invites did
                  nothing at all. */}
              <div className="sc-bands" role="radiogroup" aria-label="Predicted spread band">
                {bands.map((b, idx) => (
                  <button
                    type="button"
                    key={b.i}
                    ref={(el) => {
                      bandRefs.current[idx] = el;
                    }}
                    role="radio"
                    aria-checked={sel === b.i}
                    tabIndex={sel === null ? (idx === 0 ? 0 : -1) : sel === b.i ? 0 : -1}
                    onKeyDown={(e) => {
                      const n = bands.length;
                      let next: number | null = null;
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % n;
                      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + n) % n;
                      else if (e.key === "Home") next = 0;
                      else if (e.key === "End") next = n - 1;
                      if (next === null) return;
                      e.preventDefault();
                      setSel(bands[next].i);
                      bandRefs.current[next]?.focus();
                    }}
                    // Spells the unit out for speech, and carries the frequency hint
                    // that is rendered below the range. That hint is how a sighted
                    // player judges whether a band is a safe pick or a long shot, and
                    // leaving it out of the name meant the one piece of decision
                    // support on this screen reached only people who could see it.
                    aria-label={
                      `${b.name}, ${b.label} euro per megawatt hour` +
                      (history.length > 0
                        ? `, hit ${Math.round((bandHits[b.i] / history.length) * 100)}% of the last ${history.length} days`
                        : "")
                    }
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
                <label className="muted" style={{ fontSize: "0.8125rem" }} htmlFor="sc-exact">
                  Exact swing (optional tiebreaker):
                </label>
                <input
                  id="sc-exact"
                  className="sc-field sc-mono"
                  placeholder="e.g. 92.5"
                  inputMode="decimal"
                  value={exact}
                  onChange={(e) => setExact(e.target.value)}
                  aria-invalid={exactInvalid || undefined}
                  aria-describedby={exactInvalid ? "sc-exact-err" : undefined}
                />
                <span className="muted" style={{ fontSize: "0.75rem" }}>€/MWh</span>
              </div>
              {/* Visible, not sr-only. The submit hint above it can be sr-only
                  because its reason is five large cards on screen — a sighted
                  player already knows why the button is dim. Nothing on screen
                  says why "abc" is a problem, so hiding this would repeat the
                  countdown defect: the accessible version informing more than
                  the visual one. */}
              {exactInvalid && (
                <p id="sc-exact-err" className="sc-field-err" role="alert">
                  Enter a number like 92.5 - a swing is a high minus a low, so it cannot be negative. Or leave it blank.
                </p>
              )}
              {/* On mobile this docks flush against the bottom tab bar, so the
                  CTA and the nav read as one assembly rather than a button
                  colliding with chrome. Static on desktop. */}
              {state.user ? (
                <div className="sc-cta-dock">
                  {/* Disabled until a band is picked. Sighted users have five
                      large cards directly above and the reason is obvious; a
                      screen-reader user meets a dimmed button and is told only
                      that it is unavailable. VaultDetail's deposit modal
                      states the rule this follows — "a disabled button with no
                      stated reason is a dead end" — so the reason is attached
                      when, and only when, it applies. */}
                  {(sel == null || exactInvalid) && (
                    <span id="sc-submit-hint" className="sr-only">
                      {sel == null
                        ? "Pick one of the five bands above to enable this."
                        : "Fix the exact swing, or clear it, to enable this."}
                    </span>
                  )}
                  <button
                    className="btn btn-accent btn-block"
                    onClick={submit}
                    disabled={busy || sel == null || exactInvalid}
                    aria-describedby={sel == null || exactInvalid ? "sc-submit-hint" : undefined}
                  >
                    {state.mine ? "Update prediction" : "Lock in prediction"}
                  </button>
                  {/* "Change pick" had no way back. The only path out of edit
                      mode was a successful submit, so a player who pressed it by
                      accident — or looked at the bands and decided to stand pat —
                      could not return to the locked strip without re-submitting a
                      prediction they had already made.
                      It restores sel and exact from the stored pick as well as
                      collapsing, because the picker is live: someone can click
                      three bands while deciding, and "keep" has to mean the one
                      on the server, not the last one they touched. */}
                  {state.mine && editing && (
                    <button
                      className="btn btn-ghost btn-block"
                      onClick={() => {
                        setSel(state.mine!.band);
                        setExact(state.mine!.exact != null ? String(state.mine!.exact) : "");
                        setEditing(false);
                      }}
                    >
                      Keep current pick
                    </button>
                  )}
                </div>
              ) : (
                /* Connecting is the shell's flow (Xaman QR / deep link), so
                   this opens it rather than pointing anywhere on the page.
                   The game session exists only after the Xaman SignIn is
                   verified server-side — there is no form to fill in here. */
                <p className="sc-notice">
                  <button
                    type="button"
                    className="sc-link-btn"
                    onClick={connectShellWallet}
                    disabled={connecting}
                  >
                    Connect your XRPL wallet
                  </button>{" "}
                  to play. Your Xaman sign-in is the account - no email, no password.
                </p>
              )}
                </>
              )}
              {/* Always mounted, and a live region. This paragraph carries the
                  entire result of the game's core action — "Prediction locked
                  in", "Locked — your prediction is now on XRPL mainnet", "Pick
                  a band first", "Sign request declined in Xaman" — and it had
                  no role and no aria-live at all, so pressing Lock in
                  prediction announced nothing whatsoever. Mounted rather than
                  conditional for the reason recorded on the deposit blocker:
                  a region inserted with its text already in place is announced
                  unreliably. Empty it collapses to nothing, so this costs no
                  layout. */}
              <p
                className={msg?.kind === "err" ? "sc-err" : "sc-notice"}
                style={{ marginTop: msg ? 10 : 0 }}
                role="status"
                aria-live="polite"
              >
                {msg?.text ?? ""}
              </p>

              {commit && state.user && (
                <div className="sc-commit-box">
                  <div className="sc-commit-head">
                    <span>PREDICTION FINGERPRINT · SHA-256</span>
                    <button type="button" className="sc-commit-why" onClick={() => setShowFair(true)}>
                      Why this matters
                    </button>
                  </div>
                  {/* The break-anywhere rule belongs to the hash, not the box.
                      On the container it inherited into every button and line
                      of prose inside, and "Lock on-chain with Xaman (1 drop)"
                      rendered as "(1 dro / p)" at 320 and 390 — a word split
                      mid-syllable on the app's most important CTA.

                      .pf-value in the fair sheet already does it this way: the
                      rule sits on the value, and .pf-value.pending resets it
                      for the one case that holds a sentence. */}
                  <span className="sc-commit-hash">{commit.hash}</span>
                  {/* The pending line is the honest half of the loop: the
                      server stores an unsigned pick, but scoring, the
                      leaderboard and the participant count all ignore it
                      until the commit tx is observed on the ledger. */}
                  {!commit.signed && (
                    <p className="sc-notice" style={{ marginTop: 8, marginBottom: 0 }}>
                      Pending - this pick doesn&apos;t count until its 1-drop commit is signed in Xaman.
                    </p>
                  )}
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
                        <img src={signFlow.qrPng} alt="Xaman commit QR" width={124} height={124} style={{ background: "var(--mw-paper)", padding: 5 }} />
                        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
                          <span style={{ color: "var(--text-2)" }}>
                            {signFlow.opened ? "Opened in Xaman. Approve to commit" : "Scan with Xaman to lock your prediction on-chain"}
                          </span>
                          <a className="btn btn-ghost btn-sm" href={signFlow.deeplink} target="_blank" rel="noreferrer">
                            Open in Xaman app
                          </a>
                          <button
                            onClick={() => setSignFlow(null)}
                            /* Was 41x18 — under the 24px floor this repo's own
                               responsive-audit enforces, and the only way out
                               of the QR flow on a phone. Its two siblings in
                               this same box are 40 and 44px tall.
                               Padding grows the target to 53x30; the negative
                               margin cancels it in layout, so the grid gap
                               above it is unchanged and nothing moves. It
                               survived because no audit can reach this state:
                               it needs a signed-in player, a commitment and a
                               Xaman payload in flight. */
                            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "6px", margin: "-6px", fontFamily: "inherit", fontSize: "0.6875rem", textDecoration: "underline" }}
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
                // Thirty empty spans. They carry the shape of the last month at
                // a glance for anyone who can see them, and nothing at all
                // otherwise: no text, no label, and not focusable — the
                // `.sc-hist span:focus-visible` rule in globals.css can never
                // match, because nothing here can take focus.
                //
                // Same treatment the charts already use: name the picture and
                // let its parts become presentational. The per-day detail stays
                // pointer-only, which is acceptable because it is not exclusive
                // — the distribution is in the stats row directly below, and
                // every day is a row in the results log.
                role="img"
                aria-label={
                  history.length
                    ? `Daily price swings, last ${history.length} days: ` +
                      `${Math.round(Math.min(...history.map((h) => h.swing)))} to ` +
                      `${Math.round(Math.max(...history.map((h) => h.swing)))} euro per megawatt hour, ` +
                      `average ${histAvg.toFixed(0)}. Band distribution follows.`
                    : "Daily price swings: no data yet."
                }
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
                {tip ?? `Last ${history.length} days · select a bar for the day`}
              </div>
              <div className="sc-hist-stats">
                <span className="sc-mono muted">avg {histAvg.toFixed(0)} €/MWh</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="sc-mono" style={{ color: `var(${BAND_VARS[i]})` }}>
                    {["Calm", "Steady", "Lively", "Swingy", "Wild"][i]} {Math.round((bandHits[i] / history.length) * 100)}%
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: "0.6875rem", marginTop: 6 }}>
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
                  {/* €/MWh, not €. A swing is a rate, and every other surface
                      says so: the bands above read "< 141 €/MWh", the stats row
                      "avg 164 €/MWh", the results table "196.76 €/MWh". Even
                      the chart's own aria-label two cards up spells it "euro per
                      megawatt hour" — so the accessible description was more
                      precise than the headline it sits beside. */}
                  <div className="sc-result-num">{latest.spread.toFixed(2)} €/MWh</div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>price swing</div>
                </div>
                <span
                  className="sc-band-chip"
                  style={{ "--bc": `var(${BAND_VARS[latest.outcomeBand]})` } as React.CSSProperties}
                >
                  {latest.outcomeLabel}
                </span>
                <span className="sc-pill">{sourceLabel(latest.source)}</span>
                {latest.mine &&
                  (latest.mine.correct ? (
                    <span className="sc-pill ok">
                      ✓ you called it · +{latest.mine.points} pts · streak {latest.mine.streak}
                    </span>
                  ) : (
                    <span className="sc-pill">your pick missed, streak reset</span>
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
                {hourTip ?? "Hourly prices, 00–23 · select a bar for the hour"}
              </div>
              <p className="muted" style={{ fontSize: "0.6875rem", marginTop: 6 }}>
                blue = price went negative · full details under Results
              </p>
            </div>
          )}
        </div>

        <div className="sc-side-stack">
          {!state.user ? (
            <div className="panel sc-panel">
              <h2>Play with your wallet</h2>
              {/* No email path. A player IS an XRPL address proven by a Xaman
                  SignIn the server verifies — the shell owns that flow, this
                  panel only opens it. */}
              <p className="sc-notice" style={{ marginBottom: 12 }}>
                Sign in with Xaman, pick a nickname for the leaderboard, and lock each daily prediction on-chain
                with a 1-drop payment. No email, no deposits, free every day.
              </p>
              <button className="btn btn-accent btn-block" onClick={connectShellWallet} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect XRPL wallet"}
              </button>
              {shellAddress && (
                // The shell knows an address but no game session exists — the
                // watch-only path proves nothing, so say why the button above
                // is still the way in rather than implying they're signed in.
                <p className="sc-notice" style={{ fontSize: "0.75rem", marginTop: 10 }}>
                  <span className="sc-mono">{fmtAddress(shellAddress)}</span> is connected for browsing only.
                  Playing needs a Xaman sign-in - that signature is your account.
                </p>
              )}
            </div>
          ) : (
            <div className="panel sc-panel">
              {/* Nickname not chosen yet (the prompt after connecting handles
                  that) — fall back to the truncated address rather than an
                  empty heading. */}
              <h2>{state.user.name ?? fmtAddress(state.user.wallet)}</h2>
              <p className="sc-notice" style={{ marginTop: 8 }}>
                <span className="sc-mono">{state.user.wallet}</span>
                <br />
                Signed in with Xaman. A prediction counts once its 1-drop commit is on XRPL.
              </p>
              {mismatched && (
                <div style={{ marginTop: 12 }}>
                  <p className="sc-err">
                    The wallet in your header ({fmtAddress(shellAddress!)}) isn&apos;t the one you signed in with.
                    Predictions stay bound to the signed-in address.
                  </p>
                  {/* Switching means proving the other address the same way —
                      a fresh Xaman sign-in via the shell. No client-side
                      relink exists any more, by design. */}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={connectShellWallet}
                    disabled={connecting}
                  >
                    {connecting ? "Connecting…" : "Sign in with Xaman to switch"}
                  </button>
                </div>
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
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "5px 0", fontSize: "0.8125rem" }}>
                  <span style={{ color: `var(${BAND_VARS[i]})`, fontWeight: 700 }}>{names[i]}</span>
                  <span className="sc-mono muted">{label} €/MWh</span>
                </div>
              );
            })}
          </div>

          <div className="panel sc-panel">
            <h2>Prizes</h2>
            <p className="sc-notice">
              <b style={{ color: "var(--accent)" }}>$500 RLUSD prize pool</b>, split across the top 10 of the
              season leaderboard, paid on XRPL. Entry is always free; prizes are promotional awards from the
              sponsor, never a return on anything you paid.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
