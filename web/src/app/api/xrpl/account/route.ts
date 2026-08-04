import { NextResponse } from "next/server";
import { RLUSD, isXrplAddress, type XrplAccountSnapshot } from "@/lib/xrpl";

// Live XRPL mainnet account lookup: XRP balance (account_info) and RLUSD
// trustline balance (account_lines). Uses HTTPS JSON-RPC rather than the
// WebSocket client — serverless platforms (Vercel) can't reliably hold wss
// connections, plain fetch works everywhere. First reachable endpoint wins.

const RPC_ENDPOINTS = [
  process.env.XRPL_RPC_URL ?? "https://xrplcluster.com",
  "https://s1.ripple.com:51234",
  "https://s2.ripple.com:51234",
];

type RpcResult = Record<string, unknown> & {
  error?: string;
  error_message?: string;
  account_data?: { Balance?: string };
  lines?: { currency: string; balance: string }[];
};

/** JSON-RPC call with endpoint failover. Returns the result object even for
 * ledger-level errors like actNotFound (callers inspect `error`); throws
 * only when no endpoint is reachable. */
async function xrplRpc(method: string, params: Record<string, unknown>): Promise<RpcResult> {
  let lastErr: unknown = new Error("no endpoint reachable");
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params: [params] }),
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`http ${res.status} from ${url}`);
      const data = (await res.json()) as { result?: RpcResult };
      if (!data.result) throw new Error(`empty result from ${url}`);
      return data.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function lookup(address: string): Promise<XrplAccountSnapshot> {
  const info = await xrplRpc("account_info", { account: address, ledger_index: "validated" });
  // A valid but unfunded address (below the 1 XRP base reserve).
  if (info.error === "actNotFound") {
    return { address, funded: false, xrpBalance: 0, rlusdBalance: 0, rlusdTrustline: false };
  }
  if (info.error) throw new Error(info.error_message ?? info.error);
  const drops = Number(info.account_data?.Balance ?? 0);
  let rlusdBalance = 0;
  let rlusdTrustline = false;
  try {
    const lines = await xrplRpc("account_lines", { account: address, peer: RLUSD.issuer, ledger_index: "validated" });
    for (const line of lines.lines ?? []) {
      if (line.currency === RLUSD.currencyHex || line.currency === RLUSD.symbol) {
        rlusdTrustline = true;
        rlusdBalance += Math.max(0, Number(line.balance));
      }
    }
  } catch {
    // no lines / endpoint hiccup — treated as no trustline
  }
  return { address, funded: true, xrpBalance: drops / 1_000_000, rlusdBalance, rlusdTrustline };
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!isXrplAddress(address)) {
    return NextResponse.json({ error: "Not a valid XRPL r-address." }, { status: 400 });
  }
  try {
    return NextResponse.json(await lookup(address));
  } catch {
    return NextResponse.json(
      { error: "Could not reach XRPL mainnet right now - try again in a moment." },
      { status: 502 }
    );
  }
}
