"use client";
// First-run onboarding. Bottom sheet on phones, centred dialog on desktop.
//
// All CONTENT lives in src/lib/onboarding.ts — this file owns presentation,
// focus management and persistence plumbing only. That split is what makes the
// flow testable: steps can be re-ordered, disabled or cut without touching
// this component.
//
// Research basis (see the config for citations): linear upfront onboarding
// completes ~53% vs ~75% for contextual, so this is deliberately 4 screens.
// The wallet step OFFERS rather than requires — forcing wallet-connect before
// value is the best-documented drop-off point in web3 onboarding.
//
// Deliberately NOT a native <dialog>: showModal() renders in the browser top
// layer, above every z-index, which would put the app's own XrplConnectModal
// (a plain .overlay at z-index 1000) behind it and make it unreachable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/lib/wallet";
import {
  ONBOARDING_ENABLED,
  ONBOARDING_ON_DESKTOP,
  activeSteps,
  savedStep,
  saveStep,
  complete,
  shouldShow,
  type OnboardingStep,
} from "@/lib/onboarding";
import { ArrowLeftIcon, ChevronRightIcon, WalletIcon } from "./Icons";

/** Same number that switches on .bottom-nav in globals.css. */
const DESKTOP_MQ = "(min-width: 981px)";

export function Onboarding() {
  const { connected, connect } = useWallet();

  // null = "not decided yet". Server render and first client render both
  // produce null, so the hydrated tree matches exactly and there is no frame
  // in which the sheet exists before localStorage has been read.
  const [open, setOpen] = useState<boolean | null>(null);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [announce, setAnnounce] = useState("");

  const decided = useRef(false);
  const skipRestore = useRef(false);
  const restoreTo = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Filtered REACTIVELY, not once at mount: wallet.tsx reconnects a stored
  // address through an async account fetch, so `connected` is false on first
  // paint even for a returning connected user. A one-shot filter would show
  // the wallet step to everyone.
  const steps = useMemo<OnboardingStep[]>(
    () => activeSteps().filter((s) => !(s.offersWallet && connected)),
    [connected]
  );

  const finish = useCallback(() => {
    complete();
    setOpen(false);
  }, []);

  const goTo = useCallback(
    (n: number, d: "fwd" | "back") => {
      setDir(d);
      setI(n);
      saveStep(n);
      const s = steps[n];
      if (s) setAnnounce(`Step ${n + 1} of ${steps.length}: ${s.title}`);
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
    },
    [steps]
  );

  const next = useCallback(() => {
    if (i >= steps.length - 1) return finish();
    goTo(i + 1, "fwd");
  }, [i, steps.length, finish, goTo]);

  const back = useCallback(() => {
    if (i > 0) goTo(i - 1, "back");
  }, [i, goTo]);

  const onWallet = useCallback(() => {
    // Close before opening the connect dialog — two stacked modals is bad, and
    // this is the last step anyway, so choosing to connect *is* finishing.
    skipRestore.current = true;
    complete();
    setOpen(false);
    connect();
  }, [connect]);

  // Reached through a ref so the trap effect below can depend on [open] alone.
  const api = useRef({ next, back, finish });
  api.current = { next, back, finish };

  // ── Decide once, client-side only ──────────────────────────────────────
  useEffect(() => {
    if (decided.current) return; // StrictMode double-invokes effects in dev
    decided.current = true;

    if (!ONBOARDING_ENABLED) return setOpen(false);
    if (!ONBOARDING_ON_DESKTOP && window.matchMedia(DESKTOP_MQ).matches) return setOpen(false);

    const search = window.location.search;
    const override = new URLSearchParams(search).get("onboarding");
    const show = shouldShow(search); // note: resets storage when override === "reset"

    // Strip ?onboarding=reset so a reload or a shared link doesn't silently
    // wipe progress again. =1 and =0 are left in place on purpose.
    if (override === "reset") {
      const u = new URL(window.location.href);
      u.searchParams.delete("onboarding");
      window.history.replaceState(null, "", u.toString());
    }

    setI(override === "1" || override === "reset" ? 0 : savedStep());
    setOpen(show);
  }, []);

  // The wallet step can vanish under us if a wallet connects mid-flow, and
  // savedStep() can point past the filtered list for a returning user.
  useEffect(() => {
    if (open !== true) return;
    if (steps.length === 0 || i >= steps.length) finish();
  }, [open, i, steps.length, finish]);

  // ── Focus trap, scroll lock, keyboard, focus restore ───────────────────
  // Depends on [open] only. If it depended on `i`, every step change would
  // re-lock the body and yank focus back to the container.
  useEffect(() => {
    if (open !== true) return;
    const el = sheetRef.current;
    if (!el) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    // Focus the container, not the first button — the first focusable is Skip,
    // and announcing "Skip, button" as the user's first impression is wrong.
    // Focusing the container makes AT read the dialog role, title and lede.
    el.focus();

    const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        return api.current.finish();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        return api.current.next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        return api.current.back();
      }
      if (e.key !== "Tab") return;
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) {
        e.preventDefault();
        return el.focus();
      }
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (ev: FocusEvent) => {
      if (!el.contains(ev.target as Node)) el.focus();
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      if (skipRestore.current) {
        skipRestore.current = false;
        return;
      }
      const t = restoreTo.current;
      if (t && t.isConnected && typeof t.focus === "function") t.focus();
    };
  }, [open]);

  // ── Swipe: commit on release, no drag-follow, touch only ───────────────
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    // Leave the OS edge-back gesture alone.
    if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return;
    swipe.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || e.pointerType !== "touch") return;
    if (e.timeStamp - s.t > 600) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next();
    else back();
  };

  if (open !== true) return null;
  const step = steps[i];
  if (!step) return null;

  const isLast = i === steps.length - 1;
  const offersWallet = step.offersWallet === true && !connected;

  return (
    <div
      className="ob-scrim"
      data-testid="onboarding"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div
        ref={sheetRef}
        className="ob-sheet"
        data-dir={dir}
        data-step={step.id}
        data-index={i}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        aria-describedby="ob-lede"
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <span className="ob-grab" aria-hidden="true" />

        <div className="ob-head">
          <span className="ob-eyebrow">{step.eyebrow}</span>
          <button type="button" className="ob-skip" data-testid="onboarding-skip" onClick={finish}>
            Skip
          </button>
        </div>

        {/* The scroll container is stable; only the inner step remounts, so
            the tab stop and scroll position survive step changes. */}
        <div className="ob-body" ref={bodyRef} tabIndex={0}>
          <div className="ob-step" key={step.id}>
            <h2 className="ob-title" id="ob-title">
              {step.title}
            </h2>
            <p className="ob-lede" id="ob-lede">
              {step.body}
            </p>
            {step.points && step.points.length > 0 && (
              <ul className="ob-points">
                {step.points.map((p) => (
                  <li className="ob-point" key={p}>
                    <span className="ob-point-mark" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Outside the keyed element, so focus stays on the primary CTA and
            the whole flow can be walked with repeated Enter presses. */}
        <div className="ob-foot">
          <div className="ob-dots" aria-hidden="true">
            {steps.map((s, n) => (
              <span key={s.id} className={`ob-dot${n === i ? " on" : ""}${n < i ? " done" : ""}`} />
            ))}
          </div>

          {offersWallet && (
            <button
              type="button"
              className="btn btn-outline ob-wallet"
              data-testid="onboarding-wallet"
              onClick={onWallet}
            >
              <WalletIcon size={16} />
              Connect a wallet
            </button>
          )}

          <div className="ob-actions">
            {i > 0 && (
              <button
                type="button"
                className="btn btn-outline ob-back"
                aria-label="Back"
                data-testid="onboarding-back"
                onClick={back}
              >
                <ArrowLeftIcon size={16} />
                <span className="ob-back-label">Back</span>
              </button>
            )}
            <button type="button" className="btn btn-accent ob-next" data-testid="onboarding-next" onClick={next}>
              {step.cta}
              {!isLast && <ChevronRightIcon size={16} />}
            </button>
          </div>
        </div>

        {/* Dots are decoration to AT; progress is announced here instead. */}
        <p className="ob-live" role="status" aria-live="polite" aria-atomic="true">
          {announce}
        </p>
      </div>
    </div>
  );
}
