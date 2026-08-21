"use client";
// ─────────────────────────────────────────────────────────────
// Stream Vault demo — EVM wallet + chain-data context.
//
// Deliberately separate from lib/wallet.tsx: that provider is the XRPL
// mainnet identity for the rest of the app; this one is MetaMask on Base
// Sepolia for the on-chain demo only. Reads go through a public JSON-RPC
// provider so the whole area renders without a wallet; the signer is only
// needed to transact. No indexer: state is re-read from the contracts and
// events are re-scanned from the deploy block on a poll.
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  id as keccakId,
  type Eip1193Provider,
  type ContractTransactionResponse,
} from "ethers";
import { useToast } from "@/lib/wallet";
import { ADDRESSES, STREAM_CHAIN, DEPLOY_BLOCK } from "./config";
import { MOCK_TBILL_ABI, MOCK_USD_ABI, NAV_ORACLE_ABI, STREAM_VAULT_ABI } from "./abi";

export const ROLES = {
  megawatt: keccakId("MEGAWATT_ROLE"),
  agent: keccakId("AGENT_ROLE"),
  engineer: keccakId("ENGINEER_ROLE"),
} as const;
export type RoleKey = keyof typeof ROLES;

export interface TrancheView {
  id: number;
  name: string;
  state: number; // 0 Predeposit / 1 Streaming / 2 Expired / 3 Refunded
  capexTarget: bigint;
  refMWhTotal: bigint;
  expRevPerMWh: bigint;
  longstop: number;
  termMonths: number;
  streamStart: number;
  spvAccount: string;
  escrowPrincipal: bigint;
  escrowValue: bigint; // principal + accrued, live T-bill mark
  budgetRemaining: bigint;
  unitsMinted: bigint;
  monthsSwept: number;
  perfFactorBps: number;
  supply: bigint;
  navPerUnit: bigint; // dUSD 6dp per whole unit
  pv: bigint;
  latestCert: string;
  latestCertUsed: boolean;
  myReceipt: bigint;
  myUnits: bigint;
}

export interface DrawdownView {
  id: number;
  trancheId: number;
  amount: bigint;
  certHash: string;
  eta: number;
  executed: boolean;
  confirmations: number;
  confirmedBy: Record<RoleKey, boolean>;
}

export interface SweepEventView {
  trancheId: number;
  month: number;
  gross: bigint;
  swept: bigint;
  ownerRemainder: bigint;
  meterRef: string;
  tsoRef: string;
  bankRef: string;
  txHash: string;
  timestamp: number;
}

export interface QueueEntryView {
  index: number;
  owner: string;
  trancheId: number;
  units: bigint;
}

export interface NavPointView {
  timestamp: number;
  poolNav: bigint;
  totalUnits: bigint;
}

export interface StreamData {
  tranches: TrancheView[];
  drawdowns: DrawdownView[];
  sweeps: SweepEventView[];
  queue: QueueEntryView[]; // unpaid tail only (from queueHead)
  navHistory: NavPointView[];
  poolNav: bigint;
  reservesValue: bigint;
  totalUnitsLive: bigint;
  lastEpochClose: number;
  epochCount: number;
  aprBps: number;
  discountRateBps: number;
  sweepShareBps: number;
  timelock: number;
  epochCapBps: number;
  redeemSpreadBps: number;
  myUsd: bigint;
  myLastFaucet: number;
}

interface StreamState {
  address: string | null;
  connecting: boolean;
  wrongChain: boolean;
  roles: Record<RoleKey, boolean>;
  isSigner: boolean;
  data: StreamData | null;
  loading: boolean;
  loadError: string | null;
  busy: string | null; // label of the in-flight action
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Run a write through the connected signer, with toasts + auto-refresh. */
  run: (label: string, fn: (contracts: WriteContracts) => Promise<ContractTransactionResponse>) => Promise<boolean>;
  /** approve-if-needed helper for dUSD pulls by the vault. */
  ensureAllowance: (amount: bigint) => Promise<boolean>;
}

export interface WriteContracts {
  vault: Contract;
  usd: Contract;
}

const StreamContext = createContext<StreamState | null>(null);

const readProvider = new JsonRpcProvider(STREAM_CHAIN.rpcUrl, undefined, { staticNetwork: true });
const vaultRead = new Contract(ADDRESSES.streamVault, STREAM_VAULT_ABI, readProvider);
const oracleRead = new Contract(ADDRESSES.navOracle, NAV_ORACLE_ABI, readProvider);
const usdRead = new Contract(ADDRESSES.mockUsd, MOCK_USD_ABI, readProvider);
const tbillRead = new Contract(ADDRESSES.mockTBill, MOCK_TBILL_ABI, readProvider);

const NO_ROLES: Record<RoleKey, boolean> = { megawatt: false, agent: false, engineer: false };

function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

async function fetchData(address: string | null): Promise<StreamData> {
  const zero = "0x0000000000000000000000000000000000000000";
  const me = address ?? zero;

  const [
    trancheCountBn,
    drawdownCountBn,
    queueHeadBn,
    queueLenBn,
    navHistoryRaw,
    poolNav,
    reservesValue,
    totalUnitsLive,
    lastEpochClose,
    epochCount,
    aprBps,
    discountRateBps,
    sweepShareBps,
    timelock,
    epochCapBps,
    redeemSpreadBps,
    myUsd,
    myLastFaucet,
  ] = await Promise.all([
    vaultRead.trancheCount(),
    vaultRead.drawdownCount(),
    vaultRead.queueHead(),
    vaultRead.redeemQueueLength(),
    oracleRead.getNavHistory(),
    oracleRead.poolNav(),
    oracleRead.reservesValue(),
    vaultRead.totalUnitsLive(),
    vaultRead.lastEpochClose(),
    vaultRead.epochCount(),
    tbillRead.aprBps(),
    oracleRead.discountRateBps(),
    vaultRead.sweepShareBps(),
    vaultRead.drawdownTimelock(),
    vaultRead.epochCapBps(),
    vaultRead.redeemSpreadBps(),
    usdRead.balanceOf(me),
    usdRead.lastFaucet(me),
  ]);

  const trancheCount = Number(trancheCountBn);
  const tranches: TrancheView[] = await Promise.all(
    Array.from({ length: trancheCount }, async (_, i) => {
      const [t, supply, nav, pv, cert, myReceipt, myUnits] = await Promise.all([
        vaultRead.getTranche(i),
        vaultRead.totalSupply(i),
        oracleRead.navPerUnit(i),
        oracleRead.pvOfTranche(i),
        vaultRead.latestCert(i),
        vaultRead.receipts(i, me),
        vaultRead.balanceOf(me, i),
      ]);
      const escrowValue: bigint = t.escrowShares > 0n ? await tbillRead.previewRedeem(t.escrowShares) : 0n;
      const latestCertUsed = cert !== "0x" + "0".repeat(64) ? await vaultRead.certUsed(cert) : false;
      return {
        id: i,
        name: t.name as string,
        state: Number(t.state),
        capexTarget: t.capexTarget,
        refMWhTotal: t.refMWhTotal,
        expRevPerMWh: t.expRevPerMWh,
        longstop: Number(t.longstop),
        termMonths: Number(t.termMonths),
        streamStart: Number(t.streamStart),
        spvAccount: t.spvAccount as string,
        escrowPrincipal: t.escrowPrincipal,
        escrowValue,
        budgetRemaining: t.budgetRemaining,
        unitsMinted: t.unitsMinted,
        monthsSwept: Number(t.monthsSwept),
        perfFactorBps: Number(t.perfFactorBps),
        supply,
        navPerUnit: nav,
        pv,
        latestCert: cert as string,
        latestCertUsed,
        myReceipt,
        myUnits,
      };
    })
  );

  const drawdownCount = Number(drawdownCountBn);
  const drawdowns: DrawdownView[] = await Promise.all(
    Array.from({ length: drawdownCount }, async (_, i) => {
      const [d, byMega, byAgent, byEng] = await Promise.all([
        vaultRead.drawdowns(i),
        vaultRead.drawdownConfirmedByRole(i, ROLES.megawatt),
        vaultRead.drawdownConfirmedByRole(i, ROLES.agent),
        vaultRead.drawdownConfirmedByRole(i, ROLES.engineer),
      ]);
      return {
        id: i,
        trancheId: Number(d.trancheId),
        amount: d.amount,
        certHash: d.certHash as string,
        eta: Number(d.eta),
        executed: d.executed as boolean,
        confirmations: Number(d.confirmations),
        confirmedBy: { megawatt: byMega, agent: byAgent, engineer: byEng },
      };
    })
  );

  const queueHead = Number(queueHeadBn);
  const queueLen = Number(queueLenBn);
  const queue: QueueEntryView[] = await Promise.all(
    Array.from({ length: queueLen - queueHead }, async (_, k) => {
      const i = queueHead + k;
      const r = await vaultRead.redeemQueue(i);
      return { index: i, owner: r.owner as string, trancheId: Number(r.trancheId), units: r.units };
    })
  );

  // Sweep feed straight from the log — the reconciliation refs live only here.
  const sweepLogs = await vaultRead.queryFilter(vaultRead.filters.SweepReceived(), DEPLOY_BLOCK);
  const blockTimes = new Map<number, number>();
  await Promise.all(
    [...new Set(sweepLogs.map((l) => l.blockNumber))].map(async (bn) => {
      const b = await readProvider.getBlock(bn);
      if (b) blockTimes.set(bn, b.timestamp);
    })
  );
  const sweeps: SweepEventView[] = sweepLogs
    .map((l) => {
      const a = (l as unknown as { args: Record<string, unknown> }).args;
      return {
        trancheId: Number(a.trancheId),
        month: Number(a.month),
        gross: a.grossRevenue as bigint,
        swept: a.sweptAmount as bigint,
        ownerRemainder: a.ownerRemainder as bigint,
        meterRef: a.meterRef as string,
        tsoRef: a.tsoRef as string,
        bankRef: a.bankRef as string,
        txHash: l.transactionHash,
        timestamp: blockTimes.get(l.blockNumber) ?? 0,
      };
    })
    .reverse(); // newest first

  const navHistory: NavPointView[] = (navHistoryRaw as { timestamp: bigint; poolNav: bigint; totalUnits: bigint }[]).map(
    (p) => ({ timestamp: Number(p.timestamp), poolNav: p.poolNav, totalUnits: p.totalUnits })
  );

  return {
    tranches,
    drawdowns,
    sweeps,
    queue,
    navHistory,
    poolNav,
    reservesValue,
    totalUnitsLive,
    lastEpochClose: Number(lastEpochClose),
    epochCount: Number(epochCount),
    aprBps: Number(aprBps),
    discountRateBps: Number(discountRateBps),
    sweepShareBps: Number(sweepShareBps),
    timelock: Number(timelock),
    epochCapBps: Number(epochCapBps),
    redeemSpreadBps: Number(redeemSpreadBps),
    myUsd,
    myLastFaucet: Number(myLastFaucet),
  };
}

export function StreamProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [wrongChain, setWrongChain] = useState(false);
  const [roles, setRoles] = useState<Record<RoleKey, boolean>>(NO_ROLES);
  const [data, setData] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const addressRef = useRef<string | null>(null);
  addressRef.current = address;

  const refresh = useCallback(async () => {
    try {
      const d = await fetchData(addressRef.current);
      setData(d);
      setLoadError(null);
    } catch (e) {
      // keep last good data on transient RPC failures
      setLoadError(e instanceof Error ? e.message : "Chain read failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + poll. 12s keeps the demo lively without hammering the RPC.
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 12_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Re-read roles + balances whenever the account changes.
  useEffect(() => {
    if (!address) {
      setRoles(NO_ROLES);
      return;
    }
    let alive = true;
    Promise.all([
      vaultRead.hasRole(ROLES.megawatt, address),
      vaultRead.hasRole(ROLES.agent, address),
      vaultRead.hasRole(ROLES.engineer, address),
    ]).then(([megawatt, agent, engineer]) => {
      if (alive) setRoles({ megawatt, agent, engineer });
    });
    refresh();
    return () => {
      alive = false;
    };
  }, [address, refresh]);

  const ensureChain = useCallback(async (eth: Eip1193Provider): Promise<void> => {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STREAM_CHAIN.hexId }] });
    } catch (e) {
      const code = (e as { error?: { code?: number }; code?: number }).code ?? (e as { error?: { code?: number } }).error?.code;
      if (code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: STREAM_CHAIN.hexId,
              chainName: STREAM_CHAIN.name,
              rpcUrls: [STREAM_CHAIN.rpcUrl],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: [STREAM_CHAIN.explorer],
            },
          ],
        });
      } else {
        throw e;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      notify("No EVM wallet found — install MetaMask to use the demo.");
      return;
    }
    setConnecting(true);
    try {
      await ensureChain(eth);
      const provider = new BrowserProvider(eth);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setWrongChain(false);
        notify("Wallet connected — Base Sepolia", "success");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }, [ensureChain, notify]);

  // Track account/chain switches made inside the wallet UI.
  useEffect(() => {
    const eth = getEthereum() as (Eip1193Provider & {
      on?: (ev: string, cb: (arg: unknown) => void) => void;
      removeListener?: (ev: string, cb: (arg: unknown) => void) => void;
    }) | null;
    if (!eth?.on) return;
    const onAccounts = (accs: unknown) => {
      const list = accs as string[];
      setAddress(list.length > 0 ? list[0] : null);
    };
    const onChain = (chainId: unknown) => {
      setWrongChain(String(chainId).toLowerCase() !== STREAM_CHAIN.hexId);
    };
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const getWriteContracts = useCallback(async (): Promise<WriteContracts> => {
    const eth = getEthereum();
    if (!eth) throw new Error("No EVM wallet found.");
    await ensureChain(eth);
    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    return {
      vault: new Contract(ADDRESSES.streamVault, STREAM_VAULT_ABI, signer),
      usd: new Contract(ADDRESSES.mockUsd, MOCK_USD_ABI, signer),
    };
  }, [ensureChain]);

  const run = useCallback(
    async (label: string, fn: (c: WriteContracts) => Promise<ContractTransactionResponse>): Promise<boolean> => {
      setBusy(label);
      try {
        const contracts = await getWriteContracts();
        const tx = await fn(contracts);
        notify(`${label} — transaction submitted…`);
        await tx.wait();
        notify(`${label} — confirmed`, "success");
        await refresh();
        return true;
      } catch (e) {
        const err = e as { shortMessage?: string; reason?: string; message?: string };
        notify(`${label} failed: ${err.reason ?? err.shortMessage ?? err.message ?? "unknown error"}`);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [getWriteContracts, notify, refresh]
  );

  const ensureAllowance = useCallback(
    async (amount: bigint): Promise<boolean> => {
      if (!addressRef.current) return false;
      const allowance: bigint = await usdRead.allowance(addressRef.current, ADDRESSES.streamVault);
      if (allowance >= amount) return true;
      return run("Approve dUSD", (c) => c.usd.approve(ADDRESSES.streamVault, 2n ** 256n - 1n));
    },
    [run]
  );

  const value = useMemo<StreamState>(
    () => ({
      address,
      connecting,
      wrongChain,
      roles,
      isSigner: roles.megawatt || roles.agent || roles.engineer,
      data,
      loading,
      loadError,
      busy,
      connect,
      refresh,
      run,
      ensureAllowance,
    }),
    [address, connecting, wrongChain, roles, data, loading, loadError, busy, connect, refresh, run, ensureAllowance]
  );

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

export function useStream(): StreamState {
  const ctx = useContext(StreamContext);
  if (!ctx) throw new Error("useStream must be used within StreamProvider");
  return ctx;
}
