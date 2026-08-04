"use client";
// Modal plumbing, in one place.
//
// This behaviour existed twice already — in Sheet and in Onboarding — while
// the two dialogs that actually handle money (deposit, list-a-position) had
// none of it: no dialog role, no accessible name, no focus trap, no Escape, no
// scroll lock, no focus restore. Tab walked straight out of them into the page
// behind, and the page behind scrolled under them on a phone.
//
// Extracted from Sheet rather than written fresh, so the version that was
// already correct is the one that spread. Onboarding keeps its own copy: it
// additionally manages a history entry for Android Back, swipe gestures and
// arrow-key stepping, and folding those in would make this hook worse at the
// one job it has.

import { useCallback, useEffect, type RefObject } from "react";

/** Everything that can hold focus inside a dialog.
 *
 *  Sheet's original list omitted form fields, which was survivable only
 *  because no Sheet contained one. Both modals using this hook are mostly
 *  form, so leaving inputs out would have let Tab escape on the first field. */
const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useDialog(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;

    const restoreTo = document.activeElement as HTMLElement | null;

    // Compensate for the scrollbar so the page behind doesn't shift sideways
    // the moment the dialog opens.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    // Focus the container, not the first control — assistive tech then
    // announces the dialog and its title instead of "Close, button".
    el.focus();

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
      if (restoreTo && restoreTo.isConnected && typeof restoreTo.focus === "function") {
        restoreTo.focus();
      }
    };
  }, [open, close, panelRef]);
}

/** Scrim click-to-dismiss.
 *
 *  mousedown, not click, and only when the press *starts* on the scrim: a
 *  drag-select that begins inside the panel and releases on the backdrop would
 *  otherwise throw away whatever the user had typed. */
export function scrimDismiss(close: () => void) {
  return (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  };
}
