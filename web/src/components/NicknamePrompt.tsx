"use client";
// ─────────────────────────────────────────────────────────────
// Nickname prompt — shown right after a verified Xaman sign-in
// mints the Spreadcast session. The nickname is the only public
// identity (wallet-first model, no email), so the sheet exists to
// get it chosen before the first prediction. Closing is allowed —
// Sheet's Escape/scrim/X semantics stay intact so nobody is
// trapped — but the footer states plainly what "later" means:
// predictions are refused until a nickname is set.
// The save relies on the httpOnly sc_session cookie alone, so the
// prompt also works after a silent reconnect where the client
// holds no player object.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { Sheet } from "./Sheet";

/** Shape returned by POST /api/spreadcast/profile — mirrors the store's User. */
export interface SavedPlayer {
  id: string;
  name: string | null;
  wallet: string;
}

export function NicknamePrompt({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** "Later": closes nameless — the server refuses predictions until a name is set. */
  onClose: () => void;
  onSaved: (user: SavedPlayer) => void;
}) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 24;
  const invalid = touched && !valid && name.length > 0;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/spreadcast/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        let msg = "Could not save the nickname.";
        try {
          const d = await res.json();
          if (typeof d?.error === "string") msg = d.error;
        } catch {
          // non-JSON error body — keep the generic message
        }
        setErr(msg);
        return;
      }
      const data = (await res.json()) as { user: SavedPlayer };
      onSaved(data.user);
    } catch {
      setErr("Network error - the nickname was not saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Spreadcast"
      title="Choose your nickname"
      footer={
        <div>
          <button type="button" className="btn btn-ghost btn-block" onClick={onClose} disabled={busy}>
            Choose later
          </button>
          <p className="muted" style={{ fontSize: "0.75rem", margin: "8px 0 0", textAlign: "center" }}>
            You can browse without one, but a prediction is refused until a nickname is set.
          </p>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          void save();
        }}
      >
        <p className="muted" style={{ fontSize: 13, margin: "10px 0 16px", lineHeight: 1.55 }}>
          This is the name shown on the Spreadcast leaderboard. No email — your wallet is your
          account, and the nickname is all other players see.
        </p>
        <div className="field">
          {/* <label for>, not a <span>: this is the only field in the sheet and
              it had no accessible name at all, so it announced as a bare "edit
              text". The character range stays outside the label so it is not
              read as part of the name. */}
          <div className="field-label">
            <label htmlFor="nickname-input">Nickname</label>
            <span className="muted">2-24 characters</span>
          </div>
          <input
            id="nickname-input"
            className={`input${invalid ? " invalid" : ""}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={24}
            placeholder="e.g. gridwatcher"
            disabled={busy}
            aria-invalid={invalid || undefined}
            aria-describedby="nickname-err"
          />
          <p className="field-error" id="nickname-err" aria-live="polite">
            {err ?? (invalid ? "Nickname must be 2-24 characters." : null)}
          </p>
        </div>
        <button type="submit" className="btn btn-accent btn-block" disabled={!valid || busy}>
          {busy ? "Saving…" : "Save nickname"}
        </button>
      </form>
    </Sheet>
  );
}
