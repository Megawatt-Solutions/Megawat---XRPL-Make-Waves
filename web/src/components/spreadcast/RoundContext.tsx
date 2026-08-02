"use client";
// One fetch of /api/spreadcast/round for the whole Spreadcast section, and one
// countdown interval.
//
// This provider is mounted by src/app/spreadcast/layout.tsx, so moving between
// Play / Board / Log / How swaps only `children` — the provider, its state and
// its interval never remount. That is the "one clock" half of the plan: the
// countdown keeps ticking across tab changes instead of restarting each time.
//
// See docs/ui-ux-rehaul.md §2.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface RoundState {
  now: { day: string; hh: number; mm: number };
  user: { id: string; name: string; email: string; verified: boolean; wallet: string | null } | null;
  open:
    | { day: string; closesAt: number; boundaries: number[]; bands: { i: number; name: string; label: string }[]; participants: number }
    | { nextOpensAt: number; nextDay: string };
  mine: { band: number; exact: number | null; hash: string; txHash: string | null } | null;
  latest: {
    day: string;
    spread: number;
    outcomeLabel: string;
    outcomeBand: number;
    source: string;
    hourly: number[];
    mine: { band: number; correct: boolean; points: number; streak: number } | null;
  } | null;
  boundaries: number[];
}

interface RoundCtx {
  state: RoundState | null;
  err: string | null;
  reload: () => Promise<void>;
  isOpen: boolean;
  closesAt: number | null;
  opensAt: number | null;
  /** hh:mm:ss until close (or until the next round opens). */
  countdown: string;
  /** Milliseconds until close — used to switch the bar to its urgent state. */
  msToClose: number | null;
  streak: number | null;
}

const Ctx = createContext<RoundCtx | null>(null);

export function useRound(): RoundCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRound must be used inside <RoundProvider>");
  return c;
}

export function RoundProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RoundState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const reload = useCallback(async () => {
    // Mirrors the guard added in the crash fix: a 502 answers with { error },
    // which must not be stored as if it were a round.
    let res: Response;
    let data: (RoundState & { error?: string }) | null = null;
    try {
      res = await fetch("/api/spreadcast/round", { cache: "no-store" });
      data = (await res.json()) as RoundState & { error?: string };
    } catch {
      setErr("Game API unreachable.");
      return;
    }
    if (!res.ok || !data || !data.open) {
      setErr(data?.error || "Game API unreachable.");
      return;
    }
    setErr(null);
    setState(data);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const isOpen = !!state?.open && "day" in state.open;
  const closesAt = isOpen ? (state!.open as { closesAt: number }).closesAt : null;
  const opensAt = !isOpen && state?.open ? (state.open as { nextOpensAt: number }).nextOpensAt : null;
  const target = isOpen ? closesAt : opensAt;

  useEffect(() => {
    if (!target) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  let countdown = "–";
  if (left != null) {
    const s = Math.floor(left / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    countdown = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  const streak = state?.latest?.mine?.streak ?? null;

  return (
    <Ctx.Provider
      value={{ state, err, reload, isOpen, closesAt, opensAt, countdown, msToClose: isOpen ? left : null, streak }}
    >
      {children}
    </Ctx.Provider>
  );
}
