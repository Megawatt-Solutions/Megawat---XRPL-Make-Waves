"use client";
// Reusable overlay: bottom sheet on phones, centred dialog from 981px — the
// same breakpoint that switches .bottom-nav on, so "sheet form" and "a tab bar
// exists" stay one decision.
//
// Deliberately NOT a native <dialog>: showModal() renders in the browser top
// layer, above every z-index, which would put the app's own XrplConnectModal
// (a plain .overlay at z-index 1000) behind it and make it unreachable.
//
// Sits at z-index 950 — above .nav (50) and .bottom-nav (60), below .overlay
// (1000) and .toasts (2000).

import { useCallback, useEffect, useRef } from "react";
import { XIcon } from "./Icons";

export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Compensate for the scrollbar so the page behind doesn't shift.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    // Focus the container, not the first control — that way assistive tech
    // announces the dialog and its title rather than "Close, button".
    el.focus();

    const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        return close();
      }
      if (e.key !== "Tab") return;
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) {
        e.preventDefault();
        return el.focus();
      }
      const first = f[0];
      const last = f[f.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || a === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      const t = restoreTo.current;
      if (t && t.isConnected && typeof t.focus === "function") t.focus();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="sheet-scrim"
      // mousedown, not click: a drag-select that starts inside the panel and
      // ends on the scrim would otherwise dismiss it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
      >
        <span className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="sheet-eyebrow">{eyebrow}</div>}
            <h2 className="sheet-title" id="sheet-title">
              {title}
            </h2>
          </div>
          <button type="button" className="sheet-x" onClick={close} aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
