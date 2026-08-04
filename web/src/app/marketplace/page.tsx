"use client";
import posthog from "posthog-js";
import { useRef, useState } from "react";
import Link from "next/link";
import { StatTile } from "@/components/StatTile";
import { useWallet, useToast } from "@/lib/wallet";
import { listingViews, marketplaceMetrics } from "@/lib/marketplace";
import { POSITIONS } from "@/lib/portfolio";
import { getVault } from "@/lib/vaults";
import { useDialog, scrimDismiss } from "@/components/useDialog";
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
          <div className="page-sub">Buy and sell vault positions: exit early, or pick up yield at a discount.</div>
        </div>
        <button className="btn btn-accent" onClick={() => (connected ? setShowSell(true) : connect())}>
          Sell a position
        </button>
      </div>

      <div className="tile-grid">
        <StatTile label="Open positions" value={fmtNum(m.openPositions)} sub="Listed for sale" icon={<StoreIcon size={18} />} />
        <StatTile label="Listed value" value={fmtCompact(m.listedFaceValue, "USD")} sub="Face value" icon={<LayersIcon size={18} />} />
        <StatTile label="Total volume" value={fmtCompact(m.totalVolume, "USD")} sub="All-time secondary" icon={<CoinsIcon size={18} />} />
        {/* An average over nothing is not zero, it is undefined. "+0.0%" reads
            as a measurement — "listings are trading at face value" — when in
            fact there are no listings to average. An em dash says "no data",
            which is the true statement. "Open positions: 0" and "$0" above are
            genuine counts and totals, so they stay as they are.

            The sub is sign-aware for the same reason the value is. "Over face
            value" was printed for any non-empty book, so a market trading at a
            discount read "AVG PREMIUM / -4.6% / Over face value" — the
            subtitle asserting the opposite of the number directly above it, in
            the headline row of this page. Unreachable with today's data, which
            is why it survived: LISTINGS is empty, so the only state ever
            rendered was the em dash. Found by building the populated page
            behind a temporary fixture. A discount is the interesting case
            here, not an edge one — this page sells "pick up yield at a
            discount" in its own subtitle. */}
        <StatTile
          label="Avg premium"
          value={
            views.length === 0
              ? <span className="muted">&ndash;</span>
              : <span className={m.avgPremiumBps >= 0 ? "" : "accent"}>{premiumStr(m.avgPremiumBps)}</span>
          }
          sub={
            views.length === 0
              ? "No listings yet"
              : m.avgPremiumBps > 0
                ? "Over face value"
                : m.avgPremiumBps < 0
                  ? "Under face value"
                  : "At face value"
          }
          icon={<TrendingUpIcon size={18} />}
        />
      </div>

      <div className="section-head">
        <h2 className="section-title">Open listings <span className="section-count">{views.length}</span></h2>
        {/* Was "Settled in USDC". The dashboard footer states
            "RLUSD settlement", and WalletModal tells you deposits settle in
            RLUSD and that you will be asked to set the RLUSD trustline. USDC
            and RLUSD are different assets by different issuers, so this was not
            a synonym — it named the wrong token on the one page about moving
            money between holders. */}
        <span className="muted" style={{ fontSize: "0.8125rem" }}>Settled in RLUSD</span>
      </div>

      <div className="card mk-card" style={{ padding: "8px 20px" }}>
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
              The secondary market is where holders sell a vault position before it matures. Nothing is listed yet,
              and nothing can be until the pipeline sites start fundraising next quarter and the first positions
              exist.
            </p>
            {/* Was "Go to your portfolio", which is empty for the same reason
                this page is: no deposits are open, so no positions exist to
                list. Sending someone from one empty state to another is a loop,
                not a route. The pipeline is where the actual information is. */}
            <Link className="btn btn-ghost btn-sm" href="/">
              See the pipeline
            </Link>
          </div>
        )}
        {views.map((lv) => (
          <div key={lv.listing.id} className="drow mk-row">
            <div className="mk-c-id" style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span className="vault-thumb" style={{ width: 38, height: 38, borderRadius: "var(--r-row)" }}>
                {lv.vault.spec.hasSolar ? <SunIcon size={18} /> : <BatteryIcon size={18} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{lv.vault.name}</div>
                <div className="muted num" style={{ fontSize: "0.75rem" }}>{fmtAddress(lv.listing.seller)} · {lv.listing.listedAtDaysAgo}d ago</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }} className="num mk-c-shares">
              <span className="row-lbl">Shares</span>
              {fmtNum(lv.listing.shares)}
              <div className="muted" style={{ fontSize: "0.75rem" }}>{fmtMoney(lv.listing.pricePerShare, "USD")}/sh</div>
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
  // Focus trap, Escape, scroll lock and focus restore — this dialog had none
  // of them, so Tab walked out into the page behind and the page scrolled
  // under it on a phone. See components/useDialog.ts.
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, panelRef);
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
    <div className="overlay" onMouseDown={scrimDismiss(onClose)}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sell-modal-title"
        tabIndex={-1}
      >
        <div className="modal-title" style={{ display: "flex", justifyContent: "space-between" }}>
          <span id="sell-modal-title">List a position</span>
          <button type="button" onClick={onClose} aria-label="Close" className="modal-x"><XIcon size={18} /></button>
        </div>

        {/* With nothing to sell this dialog was a dead end dressed as a form:
            a "Position" label over an empty group, "Max 0", a calculator
            returning $0.00, and a disabled CTA that never said why. That is
            the exact failure VaultDetail's deposit modal already names —
            "a disabled button with no stated reason is a dead end" — so it
            gets the same treatment the marketplace's own empty listing state
            gets: say what is missing and where to go. */}
        {sellable.length === 0 ? (
          <div className="empty-state">
            <LayersIcon size={26} />
            <div className="empty-state-title">Nothing to list yet</div>
            <p className="empty-state-body">
              Listing sells part of a vault position you already hold. No vault is open for deposits yet - the
              pipeline sites start fundraising next quarter, and once you hold a position it will show up here to
              list.
            </p>
            <div className="empty-state-actions">
              <Link className="btn btn-accent btn-sm" href="/" onClick={onClose}>
                Browse vaults
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
        <>

        {/* Position picker */}
        <div className="field" style={{ marginTop: 18 }}>
          {/* Pick-one-of-N rendered as buttons: which one is chosen was carried
              entirely by background colour, so assistive tech heard a list of
              identical-sounding buttons and no selection. The group also had
              no name — "Position" was a div floating above it. */}
          <div className="field-label" id="sell-position-label">Position</div>
          <div role="group" aria-labelledby="sell-position-label" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sellable.map((p) => {
              const v = getVault(p.vaultId)!;
              const sel = p.vaultId === vaultId;
              return (
                <button
                  key={p.vaultId}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => { setVaultId(p.vaultId); setSharesStr(""); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                    padding: "11px 13px", borderRadius: "var(--r-row)", cursor: "pointer",
                    background: sel ? "var(--accent-dim)" : "var(--card)",
                    border: `1px solid ${sel ? "rgba(52,211,153,0.4)" : "var(--border-2)"}`,
                    color: "var(--text)",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{v.name}</span>
                  <span className="muted num" style={{ fontSize: "0.75rem" }}>{fmtNum(p.shares)} {v.symbol}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            {/* The label wraps only the text — the row also holds a button, and
                a button inside a <label> makes clicking it ambiguous (the
                label would also try to forward the click to the input). */}
            <div className="field-label">
              <label htmlFor="sell-shares">Shares</label>
              <button type="button" onClick={() => setSharesStr(String(maxShares))} className="field-max">Max {fmtNum(maxShares)}</button>
            </div>
            <input id="sell-shares" className="input" inputMode="decimal" placeholder="0" value={sharesStr} onChange={(e) => setSharesStr(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label" htmlFor="sell-price">Price / share (RLUSD)</label>
            <input id="sell-price" className="input" inputMode="decimal" placeholder="1.00" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
          </div>
        </div>

        <div className="rows">
          <div className="row"><span className="row-key">Face value</span><span className="row-val num">{fmtMoney(faceValue, "USD")}</span></div>
          <div className="row"><span className="row-key">Premium over face</span><span className={`row-val num ${premiumBps < 0 ? "accent" : ""}`}>{premiumStr(premiumBps)}</span></div>
          <div className="row"><span className="row-key">Your ask</span><span className="row-val num accent">{fmtMoney(askTotal, "USD")}</span></div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--muted)", margin: "10px 0 2px" }}>
          <CheckIcon size={14} /> Your {vault?.symbol} shares are held in marketplace escrow until sold or delisted.
        </div>

        </>
        )}

        {sellable.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
