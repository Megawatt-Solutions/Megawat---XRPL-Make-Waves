// ─────────────────────────────────────────────────────────────
// Data layer — thin client for the droplet game API.
// Postgres lives localhost-only on the droplet; the worker exposes it
// through bearer-token RPC (worker/index.mjs). This module keeps the
// old store's function names, now async. The worker owns the round
// lifecycle (open/close/settle/anchor) — the web app only reads/writes
// game state. The old JSON-file store is gone.
// ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string | null; // null until the nickname prompt after first sign-in
  wallet: string;
  demo?: boolean;
}

export interface Prediction {
  userId: string;
  day: string;
  band: number;
  exact: number | null;
  salt?: string;
  hash: string;
  txHash: string | null;
  correct?: boolean;
  streak?: number;
  multiplier?: number;
  points?: number;
  absError?: number | null;
}

export interface RoundInfo {
  day: string;
  status: "open" | "closed" | "settled";
  boundaries: number[];
  opensAt: number;
  closesAt: number;
  participants?: number;
  source?: string;
  resolution?: string;
  values?: number[];
  hourly?: number[];
  spread?: number;
  outcomeBand?: number;
  settledAt?: string;
}

export interface RoundState {
  now: { day: string; hh: number; mm: number };
  user: User | null;
  open: RoundInfo | null;
  latest: RoundInfo | null;
  mine: Prediction | null;
  myLatest: Prediction | null;
  boundaries: number[];
  nextOpensAt: number;
  nextDay: string;
}

export interface LeaderRow {
  rank: number;
  name: string;
  wallet: string | null;
  points: number;
  played: number;
  correct: number;
  streak: number;
  absError: number | null;
  isDemo: boolean;
  pending?: boolean; // pick in for an unsettled round
  signedPending?: boolean; // that pick is locked on-chain (only signed picks count)
}

export interface Anchor {
  week: string;
  root: string;
  leaves: number;
  txHash: string | null;
  simulated: boolean;
  createdAt: string;
}

export interface RevealEntry {
  user: string;
  band: number;
  exact: number | null;
  salt: string;
  hash: string;
  txHash: string | null;
  correct: boolean | null;
  points: number;
}

// ─── RPC transport ────────────────────────────────────────────

class RpcError extends Error {}

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const base = process.env.SPREADCAST_API_URL;
  const token = process.env.SPREADCAST_API_TOKEN;
  if (!base || !token) throw new RpcError("Game API is not configured (SPREADCAST_API_URL / SPREADCAST_API_TOKEN).");
  const res = await fetch(`${base}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new RpcError(data.error ?? `Game API error (${res.status}).`);
  return data;
}

export function isRpcError(e: unknown): e is RpcError {
  return e instanceof RpcError;
}

// ─── player + prediction API ──────────────────────────────────

// The wallet address must come from a server-verified Xaman payload — the
// session route is the only caller and never passes a client-supplied value.
export async function findOrCreatePlayerByWallet(wallet: string): Promise<{ user?: User; error?: string }> {
  return rpc("findOrCreatePlayerByWallet", { wallet });
}

export async function getUser(id: string): Promise<User | null> {
  return (await rpc<{ user: User | null }>("getUser", { id })).user;
}

export async function setPlayerName(id: string, name: string): Promise<{ user?: User; error?: string }> {
  return rpc("setPlayerName", { id, name });
}

export async function submitPrediction(
  userId: string,
  band: number,
  exact: number | null
): Promise<{ prediction?: { day: string; band: number; exact: number | null; hash: string }; error?: string }> {
  return rpc("submitPrediction", { userId, band, exact });
}

export async function attachCommitTx(userId: string, day: string, txHash: string): Promise<boolean> {
  return (await rpc<{ ok: boolean }>("attachCommitTx", { userId, day, txHash })).ok;
}

export async function getPrediction(userId: string, day: string): Promise<Prediction | null> {
  return (await rpc<{ prediction: Prediction | null }>("getPrediction", { userId, day })).prediction;
}

// ─── queries ──────────────────────────────────────────────────

export async function roundState(userId: string | null): Promise<RoundState> {
  return rpc("roundState", { userId });
}

export async function leaderboard(scope: "week" | "season"): Promise<LeaderRow[]> {
  return (await rpc<{ rows: LeaderRow[] }>("leaderboard", { scope })).rows;
}

export async function archive(): Promise<{ rounds: RoundInfo[]; anchors: Anchor[] }> {
  return rpc("archive");
}

export async function swingHistory(): Promise<{ day: string; swing: number }[]> {
  return (await rpc<{ days: { day: string; swing: number }[] }>("swingHistory")).days;
}

export async function archiveDay(day: string): Promise<{ round?: RoundInfo; reveal?: RevealEntry[]; error?: string }> {
  return rpc("archiveDay", { day });
}
