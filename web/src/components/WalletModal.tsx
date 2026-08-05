"use client";
import { useState } from "react";
import { useWallet, useToast } from "@/lib/wallet";
import { KYC_LABEL } from "@/lib/user";
import { explorerAccount } from "@/lib/xrpl";
import { fmtAddress, fmtNum, fmtDate } from "@/lib/format";
import {
  CopyIcon, ExternalLinkIcon, ShieldIcon, VerifiedIcon, CheckIcon,
} from "./Icons";
import { Sheet } from "./Sheet";
import { Identicon } from "./Identicon";

export function WalletModal({ onClose }: { onClose: () => void }) {
  const { profile, disconnect } = useWallet();
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);
  if (!profile) return null;

  const accredited = profile.kycLevel === 2;
  const verified = profile.kycLevel >= 1;

  const copy = () => {
    navigator.clipboard?.writeText(profile.address);
    setCopied(true);
    notify("Address copied", "success");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    // Sheet, not a bespoke .overlay: it brings a focus trap, Escape-to-close,
    // scroll lock and a bottom-sheet form on phones — none of which the old
    // centred modal had. Deliberately the FIRST sheet a user meets, so the
    // pattern reads as the app's own overlay language rather than something
    // Spreadcast imported. Restyle only; the disconnect path is untouched.
    <Sheet
      open
      onClose={onClose}
      title="Profile"
      footer={
        <button
          className="btn btn-ghost btn-block"
          onClick={() => {
            disconnect();
            notify("Wallet disconnected");
            onClose();
          }}
        >
          Disconnect
        </button>
      }
    >
      <>
        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, margin: "18px 0 20px" }}>
          <Identicon address={profile.address} size={46} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 650, fontSize: "0.9375rem" }} className="num">{fmtAddress(profile.address, 8, 6)}</span>
              <button onClick={copy} style={iconBtn} aria-label="Copy address">
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
              <a href={explorerAccount(profile.address)} target="_blank" rel="noreferrer" style={iconBtn} aria-label="View on explorer">
                <ExternalLinkIcon size={14} />
              </a>
            </div>
            <div className="muted" style={{ fontSize: "0.8125rem", marginTop: 2 }}>
              XRPL · Mainnet · {profile.via === "xaman" ? "Xaman sign-in" : "watch-only"}
              {profile.funded ? "" : " · unfunded (1 XRP base reserve)"}
            </div>
          </div>
        </div>

        {/* KYC / accreditation */}
        <div
          style={{
            background: verified ? "var(--accent-dim)" : "var(--amber-dim)",
            border: `1px solid ${verified ? "color-mix(in srgb, var(--accent) 25%, transparent)" : "color-mix(in srgb, var(--amber) 25%, transparent)"}`,
            borderRadius: "var(--r-row)",
            padding: 15,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: verified ? "var(--accent)" : "var(--amber)" }}>
                {accredited ? <VerifiedIcon size={20} /> : <ShieldIcon size={20} />}
              </span>
              <div>
                <div style={{ fontWeight: 620, fontSize: "0.875rem" }}>{KYC_LABEL[profile.kycLevel]}</div>
                {profile.kycIssuer && (
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    {profile.kycIssuer}
                    {profile.kycIssuedAt ? ` · ${fmtDate(profile.kycIssuedAt)}` : ""}
                  </div>
                )}
              </div>
            </div>
            <span className={`badge ${verified ? "badge-active" : "badge-fundraising"}`}>
              {verified ? "Eligible" : "Action needed"}
            </span>
          </div>
          {!verified && (
            <button className="btn btn-accent btn-block btn-sm" style={{ marginTop: 12 }}>
              Complete verification
            </button>
          )}
        </div>

        {/* Balances — live mainnet reads */}
        <div className="rows">
          {/* An unreachable ledger leaves the snapshot at zero, and "0.00 XRP"
              is a claim about an account rather than an admission about a
              lookup. Say which one this is. */}
          <div className="row">
            <span className="row-key">XRP balance</span>
            <span className={profile.balancesKnown ? "row-val num" : "row-val muted"}>
              {profile.balancesKnown ? `${fmtNum(profile.xrpBalance, 2)} XRP` : "Unavailable"}
            </span>
          </div>
          <div className="row">
            <span className="row-key">RLUSD balance</span>
            <span className={profile.balancesKnown ? "row-val num" : "row-val muted"}>
              {!profile.balancesKnown
                ? "Unavailable"
                : profile.rlusdTrustline
                  ? `${fmtNum(profile.rlusdBalance, 2)} RLUSD`
                  : "No trustline"}
            </span>
          </div>
          <div className="row">
            <span className="row-key">Accreditation</span>
            <span className="row-val">{accredited ? "Full (Tier 2)" : verified ? "Basic (Tier 1)" : "–"}</span>
          </div>
        </div>

        {/* Only when we actually read the ledger and found no trustline — an
            unreachable lookup is not evidence that one is missing. */}
        {profile.balancesKnown && !profile.rlusdTrustline && (
          <p className="muted" style={{ fontSize: "0.75rem", marginTop: 10 }}>
            Vault deposits settle in RLUSD - you&apos;ll be asked to set the RLUSD trustline when fundraising
            opens.
          </p>
        )}

      </>
    </Sheet>
  );
}

const iconBtn: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--r-control)",
  flexShrink: 0,
  background: "transparent",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
};
