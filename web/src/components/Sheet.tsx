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

import { useRef } from "react";
import { useDialog, scrimDismiss } from "./useDialog";
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
  // Focus trap, Escape, scroll lock, focus restore. This logic used to live
  // inline here; it was lifted into ./useDialog verbatim so the two money
  // dialogs could stop going without it. The only behavioural change is that
  // the focusable list now includes form fields, which this component never
  // happened to contain.
  useDialog(open, onClose, panelRef);

  if (!open) return null;

  return (
    <div className="sheet-scrim" onMouseDown={scrimDismiss(onClose)}>
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
          <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
