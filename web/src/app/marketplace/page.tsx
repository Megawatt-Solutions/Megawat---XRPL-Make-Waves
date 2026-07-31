"use client";
import posthog from "posthog-js";
import { useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { useWallet, useToast } from "@/lib/wallet";
import { listingViews, marketplaceMetrics } from "@/lib/marketplace";
import { POSITIONS } from "@/lib/portfolio";
import { getVault } from "@/lib/vaults";
import { fmtMoney, fmtCompact, fmtPct, fmtNum, bpsToPct, fmtAddress } from "@/lib/format";
import type { ListingView } from "@/lib/marketplace";
import {
  StoreIcon, CoinsIcon, TrendingUpIcon, LayersIcon, SunIcon, BatteryIcon, XIcon, CheckIcon,
} from "@/components/Icons";


function premiumStr(bps: number) {
  return `${bps >= 0 ? "+" : ""}${fmtPct(bps / 100)}`;
}

export default function MarketplacePage() {
  const { connected, connect } = useWallet();
  const { notify } = useToast();
  const m = marketplaceMetrics();
  const views = listingViews();
  const [showSell, setShowSell] = useState(false);

  const buy = (lv: ListingView) => {
    if (!connected) return connect();
    posthog.capture("marketplace_buy_clicked", {
      vault_id: lv.vault.id,
      vault_name: lv.vault.name,
      vault_symbol: lv.vault.symbol,
      shares: lv.listing.shares,
      ask_total_usd: lv.askTotal,
      premium_bps: lv.premiumBps,
    });
    notify(`Bought ${fmtNum(lv.listing.shares)} ${lv.vault.symbol} for ${fmtMoney(lv.askTotal, "USD")}`, "success");
  };

  return (
    <main className="page">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title">Marketplace</h1>
          <div className="page-sub">Buy and sell vault positions — exit early or pick up yield at a discount.</div>
        </div>
        <button className="btn btn-accent" onClick={() => (connected ? setShowSell(true) : connect())}>
          Sell a position
        </button>
      </div>

      <div className="tile-grid">
        <StatTile label="Open positions" value={fmtNum(m.openPositions)} sub="Listed for sale" icon={<StoreIcon size={18} />} />
        <StatTile label="Listed value" value={fmtCompact(m.listedFaceValue, "USD")} sub="Face value" icon={<LayersIcon size={18} />} />
        <StatTile label="Total volume" value={fmtCompact(m.totalVolume, "USD")} sub="All-time secondary" icon={<CoinsIcon size={18} />} />
        <StatTile
          label="Avg premium"
          value={<span className={m.avgPremiumBps >= 0 ? "" : "accent"}>{premiumStr(m.avgPremiumBps)}</span>}
          sub="Over face value"
          icon={<TrendingUpIcon size={18} />}
        />
      </div>

      <div className="section-head">
        <h2 className="section-title">Open listings <span className="section-count">{views.length}</span></h2>
        <span className="muted" style={{ fontSize: 13 }}>Settled in USDC</span>
      </div>

      <div className="card" style={{ padding: "8px 20px" }}>
        {/* Column headers describe rows — with no rows they describe nothing,
            so they'd sit as a stray strip above the empty state on desktop. */}
        <div className="drow-head mk-head caps" aria-hidden="true" hidden={views.length === 0}>
          <span>Vault · Seller</span>
          <span style={{ textAlign: "right" }}>Shares</span>
          <span style={{ textAlign: "right" }}>Premium</span>
          <span style={{ textAlign: "right" }}>Est. APY</span>
          <span style={{ textAlign: "right" }}>Ask</span>
          <span />
        </div>
        {views.length === 0 && (
          // Was a header row over nothing. An empty marketplace is the normal
          // early state, not an error — say what it means and what to do.
          <div className="empty-state">
            <StoreIcon size={26} />
            <div className="empty-state-title">No positions listed right now</div>
            <p className="empty-state-body">
              The secondary market is where holders sell a vault position before it matures. Nothing is listed yet —
              list one from your portfolio, or check back once vaults are further into their term.
            </p>
            <Link className="btn btn-ghost btn-sm" href="/portfolio">
              Go to your portfolio
            </Link>
          </div>
        )}
        {views.map((lv) => (
          <div key={lv.listing.id} className="drow mk-row">
            <div className="mk-c-id" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span className="vault-thumb" style={{ width: 38, height: 38, borderRadius: 10 }}>
                {lv.vault.spec.hasSolar ? <SunIcon size={18} /> : <BatteryIcon size={18} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{lv.vault.name}</div>
                <div className="muted num" style={{ fontSize: 12 }}>{fmtAddress(lv.listing.seller)} · {lv.listing.listedAtDaysAgo}d ago</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }} className="num mk-c-shares">
              <span className="row-lbl">Shares</span>
              {fmtNum(lv.listing.shares)}
              <div className="muted" style={{ fontSize: 12 }}>{fmtMoney(lv.listing.pricePerShare, "USD")}/sh</div>
            </div>
            {/* Premium, APY and the ask total used to be `display: none` below
                700px, which meant a phone showed a Buy button and never the
                price it charged. They now share a `meta` strip on the row's
                own line — the same three numbers, wrapped instead of dropped.
                `display: contents` puts them straight back into the six-column
                grid above 700px, so the desktop row is untouched. */}
            <div className="mk-meta">
              <div>
                <span className="row-lbl">Premium</span>
                <span className={`badge ${lv.premiumBps >= 0 ? "badge-fundraising" : "badge-active"}`}>{premiumStr(lv.premiumBps)}</span>
              </div>
              <div style={{ textAlign: "right" }} className="num accent">
                <span className="row-lbl">Est. APY</span>
                {fmtPct(bpsToPct(lv.estApyBps))}
              </div>
              <div style={{ textAlign: "right", fontWeight: 650 }} className="num">
                <span className="row-lbl">Ask</span>
                {fmtMoney(lv.askTotal, "USD")}
              </div>
            </div>
            <div className="mk-c-buy" style={{ display: "flex", justifyContent: "flex-end" }}>
              {/* Every listing renders a button whose only text is "Buy", so a
                  screen reader hears "Buy, button" once per row with nothing to
                  tell them apart. The name says which listing and what it
                  costs; "Buy" stays first so the accessible name still contains
                  the visible label (WCAG 2.5.3). */}
              <button
                className="btn btn-accent btn-sm"
                onClick={() => buy(lv)}
                aria-label={`Buy ${fmtNum(lv.listing.shares)} shares of ${lv.vault.name} for ${fmtMoney(lv.askTotal, "USD")}`}
              >
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>

      {showSell && <SellModal onClose={() => setShowSell(false)} onDone={(msg) => { notify(msg, "success"); setShowSell(false); }} />}
    </main>
  );
}

function SellModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const sellable = POSITIONS.filter((p) => p.shares > 0);
  const [vaultId, setVaultId] = useState(sellable[0]?.vaultId ?? "");
  const pos = sellable.find((p) => p.vaultId === vaultId);
  const vault = getVault(vaultId);
  const [sharesStr, setSharesStr] = useState("");
  const [priceStr, setPriceStr] = useState("1.00");

  const maxShares = pos?.shares ?? 0;
  const shares = Math.min(parseFloat(sharesStr) || 0, maxShares);
  const price = parseFloat(priceStr) || 0;
  const faceValue = shares * 1;
  const askTotal = shares * price;
  const premiumBps = Math.round((price - 1) * 10000);
  const valid = shares > 0 && price > 0 && !!vault;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>List a position</span>
          <button onClick={onClose} aria-label="Close" className="modal-x"><XIcon size={18} /></button>
        </div>

        {/* Position picker */}
        <div className="field" style={{ marginTop: 18 }}>
          <div className="field-label">Position</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sellable.map((p) => {
              const v = getVault(p.vaultId)!;
              const sel = p.vaultId === vaultId;
              return (
                <button
                  key={p.vaultId}
                  onClick={() => { setVaultId(p.vaultId); setSharesStr(""); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                    padding: "11px 13px", borderRadius: 11, cursor: "pointer",
                    background: sel ? "var(--accent-dim)" : "var(--card)",
                    border: `1px solid ${sel ? "rgba(52,211,153,0.4)" : "var(--border-2)"}`,
                    color: "var(--text)",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</span>
                  <span className="muted num" style={{ fontSize: 12 }}>{fmtNum(p.shares)} {v.symbol}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <div className="field-label"><span>Shares</span><button onClick={() => setSharesStr(String(maxShares))} className="field-max">Max {fmtNum(maxShares)}</button></div>
            <input className="input" inputMode="decimal" placeholder="0" value={sharesStr} onChange={(e) => setSharesStr(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <div className="field-label">Price / share (USDC)</div>
            <input className="input" inputMode="decimal" placeholder="1.00" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
          </div>
        </div>

        <div className="rows">
          <div className="row"><span className="row-key">Face value</span><span className="row-val num">{fmtMoney(faceValue, "USD")}</span></div>
          <div className="row"><span className="row-key">Premium over face</span><span className={`row-val num ${premiumBps < 0 ? "accent" : ""}`}>{premiumStr(premiumBps)}</span></div>
          <div className="row"><span className="row-key">Your ask</span><span className="row-val num accent">{fmtMoney(askTotal, "USD")}</span></div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)", margin: "10px 0 2px" }}>
          <CheckIcon size={14} /> Your {vault?.symbol} shares are held in marketplace escrow until sold or delisted.
        </div>

        <div className="modal-footer" style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" style={{ flex: 1 }} disabled={!valid}
            onClick={() => {
              posthog.capture("marketplace_position_listed", {
                vault_id: vault!.id,
                vault_name: vault!.name,
                vault_symbol: vault!.symbol,
                shares,
                price_per_share: price,
                ask_total_usd: askTotal,
                premium_bps: premiumBps,
              });
              onDone(`Listed ${fmtNum(shares)} ${vault!.symbol} at ${fmtMoney(price, "USD")}/share (${premiumStr(premiumBps)})`);
            }}>
            List position
          </button>
        </div>
      </div>
    </div>
  );
}
