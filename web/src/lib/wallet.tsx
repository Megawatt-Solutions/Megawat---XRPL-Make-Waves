"use client";
// ─────────────────────────────────────────────────────────────
// Wallet + toast providers — XRPL mainnet.
import posthog from "posthog-js";
// Connect opens the XRPL connect dialog. Primary flow: Xaman (XUMM)
// sign-in — the server creates a SignIn payload, the user scans the
// QR (or taps the deep link on mobile) and signs in the Xaman app,
// proving ownership of the r-address. A signed payload's uuid is
// then posted to /api/spreadcast/session, where the server verifies
// the signature itself and mints the Spreadcast game session
// (wallet-first identity — no email). The watch-only fallback
// proves nothing, so it never creates a session: it stays for
// browsing while XUMM API keys are not configured. Either way
// the app then does a LIVE mainnet lookup (XRP balance + RLUSD
// trustline) through /api/xrpl/account.
// KYC is presented as verified; production issues XRPL Credentials
// (XLS-70).
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { UserProfile } from "./types";
import type { XrplAccountSnapshot } from "./xrpl";
import { NicknamePrompt } from "@/components/NicknamePrompt";

/** Spreadcast identity minted by POST /api/spreadcast/session; name stays null until the nickname prompt is answered. */
export interface SpreadcastPlayer {
  id: string;
  name: string | null;
  wallet: string;
}

interface WalletState {
  connected: boolean;
  connecting: boolean;
  profile: UserProfile | null;
  /**
   * Spreadcast player from THIS page load's Xaman sign-in; null when watch-only,
   * signed out, or silently reconnected (the httpOnly sc_session cookie survives
   * reloads, so /api/spreadcast/round remains the source of truth for identity).
   */
  player: SpreadcastPlayer | null;
  /** Opens the XRPL connect dialog (Xaman sign-in / watch-only fallback). */
  connect: () => void;
  disconnect: () => void;
  /** Re-opens the nickname sheet — for actions that need the name a player postponed. */
  openNamePrompt: () => void;
  /** Re-read live account state (XRP / RLUSD balances) from mainnet. */
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

/** Linked address + method, persisted for silent reconnect. */
const ADDRESS_KEY = "mw.xrplAddress";
const VIA_KEY = "mw.xrplVia";

export interface Toast {
  id: number;
  message: string;
  type: "default" | "success";
}
interface ToastState {
  toasts: Toast[];
  notify: (message: string, type?: Toast["type"]) => void;
}
const ToastContext = createContext<ToastState | null>(null);

function buildProfile(snap: XrplAccountSnapshot, via: UserProfile["via"]): UserProfile {
  return {
    address: snap.address,
    kycLevel: 2,
    kycIssuer: "Megawatt Compliance · XRPL Credentials (XLS-70)",
    kycIssuedAt: "2026-07-10",
    xrpBalance: snap.xrpBalance,
    rlusdBalance: snap.rlusdBalance,
    rlusdTrustline: snap.rlusdTrustline,
    funded: snap.funded,
    balancesKnown: snap.balancesKnown !== false,
    via,
  };
}

async function fetchAccount(address: string): Promise<XrplAccountSnapshot> {
  const res = await fetch(`/api/xrpl/account?address=${encodeURIComponent(address)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Account lookup failed.");
  return data as XrplAccountSnapshot;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [player, setPlayer] = useState<SpreadcastPlayer | null>(null);
  const [namePromptOpen, setNamePromptOpen] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const notify = useCallback((message: string, type: Toast["type"] = "default") => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const adopt = useCallback((snap: XrplAccountSnapshot, via: UserProfile["via"]) => {
    setProfile(buildProfile(snap, via));
    setConnected(true);
    localStorage.setItem(ADDRESS_KEY, snap.address);
    localStorage.setItem(VIA_KEY, via);
  }, []);

  const connect = useCallback(() => setShowConnect(true), []);
  const openNamePrompt = useCallback(() => setNamePromptOpen(true), []);

  const disconnect = useCallback(() => {
    posthog.capture("wallet_disconnected");
    posthog.reset();
    // Fire-and-forget: clearing the httpOnly game-session cookie is idempotent
    // and the local sign-out must not wait on the network.
    fetch("/api/spreadcast/session", { method: "DELETE" }).catch(() => {});
    localStorage.removeItem(ADDRESS_KEY);
    localStorage.removeItem(VIA_KEY);
    setConnected(false);
    setProfile(null);
    setPlayer(null);
    setNamePromptOpen(false);
  }, []);

  const refresh = useCallback(async () => {
    const current = profile;
    if (!current) return;
    try {
      const snap = await fetchAccount(current.address);
      setProfile((p) => (p && p.address === current.address ? buildProfile(snap, current.via) : p));
    } catch {
      // keep the stale balances on lookup failure
    }
  }, [profile]);

  // Silent reconnect for a previously linked address.
  useEffect(() => {
    const stored = localStorage.getItem(ADDRESS_KEY);
    if (!stored) return;
    const via = (localStorage.getItem(VIA_KEY) === "xaman" ? "xaman" : "watch") as UserProfile["via"];
    let alive = true;
    fetchAccount(stored)
      .then((snap) => {
        if (alive) adopt(snap, via);
      })
      .catch(() => {
        // Mainnet unreachable. Staying signed in is right — the address is
        // remembered locally and does not depend on the ledger being up — but
        // the zeros below are not balances, they are the absence of a read.
        // balancesKnown: false is what stops them being printed as figures.
        if (alive)
          adopt(
            { address: stored, funded: true, xrpBalance: 0, rlusdBalance: 0, rlusdTrustline: false, balancesKnown: false },
            via
          );
      });
    return () => {
      alive = false;
    };
  }, [adopt]);

  const finishConnect = useCallback(
    async (address: string, via: UserProfile["via"], payloadUuid?: string) => {
      setConnecting(true);
      try {
        // The signature already happened — it is the part that cost the player
        // an app-switch and a tap, and it proves the address on its own. A
        // balance read is a nicety layered on top, so letting it throw here
        // threw the whole sign-in away and sent them back to the QR. Balances
        // fall back to unknown (never to zeros presented as reads) and the
        // session below is still minted.
        let snap: XrplAccountSnapshot;
        try {
          snap = await fetchAccount(address);
        } catch {
          snap = { address, funded: true, xrpBalance: 0, rlusdBalance: 0, rlusdTrustline: false, balancesKnown: false };
          notify("Signed in - balances unavailable, XRPL mainnet did not answer.");
        }
        adopt(snap, via);
        // Game session only for a signed Xaman payload: the server re-verifies
        // the signature itself, so a watch-only link can never mint one.
        if (via === "xaman" && payloadUuid) {
          const res = await fetch("/api/spreadcast/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uuid: payloadUuid }),
          });
          if (res.ok) {
            const data = (await res.json()) as { user: SpreadcastPlayer; needsName: boolean };
            setPlayer(data.user);
            // Identify by the game player id, never the r-address — a chain
            // identity must not become an analytics identifier (house rules).
            posthog.identify(data.user.id, { via, funded: snap.funded });
            if (data.needsName) setNamePromptOpen(true);
          } else {
            let msg = "Signed in, but the Spreadcast session could not be created — play is unavailable.";
            try {
              const d = await res.json();
              if (typeof d?.error === "string") msg = d.error;
            } catch {
              // non-JSON error body — keep the generic message
            }
            notify(msg);
          }
        }
        posthog.capture("wallet_connected", {
          via,
          funded: snap.funded,
          rlusd_trustline: snap.rlusdTrustline,
        });
        setShowConnect(false);
        notify(
          via === "xaman"
            ? "Signed in with Xaman - XRPL Mainnet"
            : snap.funded
              ? "Wallet linked (watch-only) - browsing only. Sign in with Xaman to play Spreadcast."
              : "Address linked - account not yet funded (1 XRP base reserve)",
          "success"
        );
      } catch (e) {
        posthog.capture("wallet_connection_failed", {
          via,
          error: e instanceof Error ? e.message : "unknown",
        });
        notify(e instanceof Error ? e.message : "Connection failed.");
      } finally {
        setConnecting(false);
      }
    },
    [adopt, notify]
  );

  return (
    <WalletContext.Provider
      value={{ connected, connecting, profile, player, connect, disconnect, openNamePrompt, refresh }}
    >
      <ToastContext.Provider value={{ toasts, notify }}>
        {children}
        {showConnect && (
          <XrplConnectModal connecting={connecting} onClose={() => setShowConnect(false)} onFinish={finishConnect} />
        )}
        {/* Conditionally mounted so a "later" close resets the form for the next open. */}
        {namePromptOpen && (
          <NicknamePrompt
            open
            onClose={() => setNamePromptOpen(false)}
            onSaved={(u) => {
              setPlayer(u);
              setNamePromptOpen(false);
              notify("Nickname saved - see you on the leaderboard", "success");
            }}
          />
        )}
        <ToastViewport />
      </ToastContext.Provider>
    </WalletContext.Provider>
  );
}

// ─── XRPL connect dialog (Xaman-first) ────────────────────────

type XamanPhase =
  | { step: "starting" }
  | { step: "qr"; uuid: string; qrPng: string; deeplink: string; opened: boolean }
  | { step: "manual"; reason: string | null }
  | { step: "failed"; message: string };

function XrplConnectModal({
  connecting,
  onClose,
  onFinish,
}: {
  connecting: boolean;
  onClose: () => void;
  /** payloadUuid is present only for a signed Xaman payload — it is what the server verifies to mint the game session. */
  onFinish: (address: string, via: UserProfile["via"], payloadUuid?: string) => void;
}) {
  const [phase, setPhase] = useState<XamanPhase>({ step: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [address, setAddress] = useState("");
  const validAddr = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address.trim());
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  // Create the Xaman SignIn payload; fall back to watch-only when the
  // deployment has no XUMM keys (501) or Xaman is unreachable.
  useEffect(() => {
    let alive = true;
    fetch("/api/xrpl/xaman", { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!alive) return;
        if (res.ok) {
          setPhase({ step: "qr", uuid: data.uuid, qrPng: data.qrPng, deeplink: data.deeplink, opened: false });
        } else {
          setPhase({ step: "manual", reason: res.status === 501 ? null : (data.error ?? null) });
        }
      })
      .catch(() => {
        if (alive) setPhase({ step: "manual", reason: "Xaman is unreachable right now." });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Poll the payload until signed / cancelled / expired.
  const uuid = phase.step === "qr" ? phase.uuid : null;
  useEffect(() => {
    if (!uuid) return;
    let alive = true;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/xrpl/xaman?uuid=${uuid}`, { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        if (!alive) return;
        if (s.signed && s.account) {
          clearInterval(iv);
          finishRef.current(s.account, "xaman", uuid);
        } else if (s.cancelled || s.expired) {
          clearInterval(iv);
          setPhase({ step: "failed", message: s.expired ? "Sign-in request expired." : "Sign-in was declined in Xaman." });
        } else if (s.opened) {
          setPhase((p) => (p.step === "qr" ? { ...p, opened: true } : p));
        }
      } catch {
        // transient — keep polling
      }
    }, 2500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [uuid]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Connect XRPL wallet</div>

        {phase.step === "starting" && (
          <p className="muted" style={{ fontSize: 13, margin: "16px 0" }}>Preparing Xaman sign-in…</p>
        )}

        {phase.step === "qr" && (
          <>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 16px", lineHeight: 1.55 }}>
              Scan with the <b style={{ color: "var(--text)" }}>Xaman</b> app and approve the sign-in request —
              this proves ownership of your account. Balances are then read live from XRPL mainnet.
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              {/* QR served by Xaman's cloud for this payload */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={phase.qrPng}
                alt="Xaman sign-in QR"
                width={200}
                height={200}
                style={{ background: "var(--mw-paper)", padding: 8 }}
              />
              <div className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
                <span className="dot pulse" style={{ background: "var(--accent)" }} />
                {connecting ? "Reading ledger…" : phase.opened ? "Opened in Xaman - approve to continue" : "Waiting for scan…"}
              </div>
              <a className="btn btn-ghost btn-block" href={phase.deeplink} target="_blank" rel="noreferrer">
                Open in Xaman app
              </a>
            </div>
            <button
              onClick={() => setPhase({ step: "manual", reason: null })}
              style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", padding: "12px 0 0", fontFamily: "inherit", textDecoration: "underline" }}
            >
              Use a watch-only address instead
            </button>
          </>
        )}

        {phase.step === "manual" && (
          <>
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 16px", lineHeight: 1.55 }}>
              Link your XRPL mainnet account. Balances are read live from the ledger; deposits will settle in
              RLUSD once vault tokenization opens.
            </p>
            <div className="field">
              <div className="field-label">
                <span>XRPL address</span>
                <span className="muted">Mainnet</span>
              </div>
              <input
                className="input num"
                placeholder="rYourXrplAddress…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={connecting}
                autoFocus
              />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 14px" }}>
              {phase.reason ??
                "Watch-only link (no signature): browse vaults and results, but Spreadcast play requires a signed Xaman sign-in, which activates once XUMM API keys are configured on the server."}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={connecting}>
                Cancel
              </button>
              <button
                className="btn btn-accent"
                style={{ flex: 1 }}
                disabled={!validAddr || connecting}
                onClick={() => onFinish(address.trim(), "watch")}
              >
                {connecting ? "Reading ledger…" : "Connect"}
              </button>
            </div>
          </>
        )}

        {phase.step === "failed" && (
          <>
            <p className="muted" style={{ fontSize: 13, margin: "16px 0" }}>{phase.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                Close
              </button>
              <button
                className="btn btn-accent"
                style={{ flex: 1 }}
                onClick={() => {
                  setPhase({ step: "starting" });
                  setAttempt((a) => a + 1);
                }}
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToastViewport() {
  const ctx = useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div className="toasts">
      {ctx.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === "success" ? "toast-success" : ""}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within AppProviders");
  return ctx;
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within AppProviders");
  return ctx;
}
