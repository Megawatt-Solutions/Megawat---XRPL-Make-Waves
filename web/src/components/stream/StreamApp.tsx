"use client";
// Stream Vault demo shell: banner (required on every screen), wallet strip,
// and the five demo surfaces as tabs.
import { useState } from "react";
import { useStream } from "@/lib/stream/StreamProvider";
import { DEMO_BANNER, STREAM_CHAIN, ADDRESSES } from "@/lib/stream/config";
import { fmtAddress } from "@/lib/format";
import { usd6, useNowSec } from "./bits";
import { Overview } from "./Overview";
import { Tranches } from "./Tranches";
import { Drawdowns } from "./Drawdowns";
import { Sweeps } from "./Sweeps";
import { Redeem } from "./Redeem";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "tranches", label: "Tranches" },
  { key: "drawdowns", label: "Drawdown console" },
  { key: "sweeps", label: "Sweep feed" },
  { key: "redeem", label: "Redeem" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function StreamApp() {
  const { address, connecting, connect, data, loading, loadError, roles, run, busy } = useStream();
  const [tab, setTab] = useState<TabKey>("overview");
  const now = useNowSec();

  const faucetReady = !data || now >= data.myLastFaucet + 3600;

  return (
    <div className="page">
      {/* required global demo banner */}
      <div
        role="note"
        style={{
          background: "var(--accent-dim)",
          border: "1px solid var(--accent-glow)",
          color: "var(--text)",
          borderRadius: 10,
          padding: "9px 14px",
          fontSize: 13,
          marginBottom: 18,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span aria-hidden style={{ color: "var(--accent)" }}>⚠</span>
        {DEMO_BANNER}
        <a className="accent" href={STREAM_CHAIN.faucet} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12 }}>
          Base Sepolia ETH faucet ↗
        </a>
      </div>

      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 className="page-title">Stream Vault (demo)</h1>
          <p className="page-sub">
            Pre-deposit escrow → RTB conversion → milestone drawdowns → monthly revenue sweeps → NAV, live on{" "}
            <a className="accent" href={`${STREAM_CHAIN.explorer}/address/${ADDRESSES.streamVault}`} target="_blank" rel="noreferrer">
              Base Sepolia ↗
            </a>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {address && data && (
            <>
              <span className="badge badge-soon num" title="Demo USD balance">{usd6(data.myUsd, 0)} dUSD</span>
              <button
                className="btn btn-outline btn-sm"
                disabled={!faucetReady || !!busy}
                title={faucetReady ? "Mints 10,000 dUSD (once per hour)" : "Faucet cools down for an hour"}
                onClick={() => run("dUSD faucet", (c) => c.usd.faucet())}
              >
                dUSD faucet
              </button>
            </>
          )}
          {address ? (
            <span className="wallet-pill num" title={address}>
              {fmtAddress(address)}
              <span className="wallet-dot" />
            </span>
          ) : (
            <button className="connect-btn" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect MetaMask"}
            </button>
          )}
        </div>
      </div>

      {(roles.megawatt || roles.agent || roles.engineer) && (
        <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
          Signer roles on this wallet:{" "}
          {[roles.megawatt && "Megawatt", roles.agent && "Security agent", roles.engineer && "Engineer"]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <nav aria-label="Stream vault sections" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 20 }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            aria-current={tab === tb.key ? "page" : undefined}
            style={{
              background: "none",
              border: "none",
              borderBottom: `2px solid ${tab === tb.key ? "var(--accent)" : "transparent"}`,
              color: tab === tb.key ? "var(--accent)" : "var(--text-2)",
              padding: "9px 13px",
              fontSize: 13.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {loading && !data && <p className="muted" style={{ fontSize: 13 }}>Reading Base Sepolia…</p>}
      {loadError && !data && (
        <p className="muted" style={{ fontSize: 13 }}>
          Could not reach Base Sepolia: {loadError}
        </p>
      )}
      {data && (
        <>
          {tab === "overview" && <Overview />}
          {tab === "tranches" && <Tranches />}
          {tab === "drawdowns" && <Drawdowns />}
          {tab === "sweeps" && <Sweeps />}
          {tab === "redeem" && <Redeem />}
        </>
      )}
    </div>
  );
}
