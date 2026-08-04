// Onboarding configuration and persistence.
//
// Everything about the flow is data, so it can be turned off, re-ordered or
// A/B'd without touching the component. See docs/onboarding.md.
//
// Design rationale (research-backed, 2026):
//  - Linear "show every feature upfront" onboarding completes at ~53%;
//    contextual/progressive completes at ~75%. So this is deliberately SHORT
//    (4 screens) and the app itself teaches the rest in context.
//  - Value is shown before anything is asked of the user.
//  - The wallet step is SKIPPABLE. Forcing wallet-connect before value is the
//    single best-documented drop-off point in web3 onboarding — you can browse
//    every vault and read every result without it. Playing Spreadcast is the
//    exception now that a pick is an on-chain commitment: identity and the
//    daily commit are both signatures, so the game needs a wallet. The step is
//    still skippable because everything except playing works without one.

export const ONBOARDING_VERSION = 1;

/** Master switch. Set false to disable the flow everywhere, instantly. */
export const ONBOARDING_ENABLED = true;

/**
 * Show on desktop too?
 * Research is mobile-centric, but this product is unusual enough (grid
 * batteries + XRPL + a forecasting game) that a cold desktop visitor is just
 * as lost. The flow adapts rather than duplicating: a centred dialog on
 * desktop, a full-height sheet on phones.
 */
export const ONBOARDING_ON_DESKTOP = true;

const KEY = `mw.onboarding.v${ONBOARDING_VERSION}`;

export interface OnboardingStep {
  id: string;
  /** Small mono eyebrow above the title. */
  eyebrow: string;
  title: string;
  body: string;
  /** Optional supporting points — keep to three, they are scanned not read. */
  points?: string[];
  /** Label for the primary button. Final step's label is the completion CTA. */
  cta: string;
  /** Renders the wallet-connect affordance alongside the primary CTA. */
  offersWallet?: boolean;
  enabled?: boolean;
}

/**
 * The flow. Each screen answers exactly one question a first-time visitor has,
 * in the order they would ask it. Disable any step with `enabled: false`.
 */
export const STEPS: OnboardingStep[] = [
  {
    id: "what",
    eyebrow: "What this is",
    title: "Grid batteries, onchain",
    body:
      "Megawatt turns real battery storage sites into something you can hold a share of. The batteries are physical and already running - Ljubljana and Metlika are live today.",
    points: [
      "Batteries charge when power is cheap and sell when it's expensive",
      "That daily price gap is the revenue",
      "Vaults tokenise a share of it on the XRP Ledger",
    ],
    cta: "How it works",
  },
  {
    id: "where",
    eyebrow: "Getting around",
    title: "Four places worth knowing",
    body: "Everything lives under one nav. Nothing here needs a wallet to look at.",
    points: [
      "Vaults - every site, its capacity, and what it yields",
      "Portfolio: your positions and claimable yield",
      "Marketplace: trade a position before it matures",
      "Spreadcast: the free daily game, explained next",
    ],
    cta: "What's Spreadcast?",
  },
  {
    id: "spreadcast",
    eyebrow: "The daily habit",
    title: "Call tomorrow's spread",
    body:
      "Spreadcast asks you to predict how far apart tomorrow's highest and lowest electricity prices will be, the exact number the batteries earn on. One pick a day, free, no purchase.",
    points: [
      "Pick a band before 11:45 Ljubljana time",
      "It settles against official European market prices",
      "Your pick is committed on-chain before the result exists",
    ],
    cta: "Nearly done",
  },
  {
    id: "wallet",
    eyebrow: "Optional",
    title: "Connect when you're ready",
    body:
      "You can browse every vault and read every result without connecting anything. A wallet is needed to deposit — and to play Spreadcast, where your Xaman sign-in is the account.",
    cta: "Explore first",
    offersWallet: true,
  },
];

export function activeSteps(): OnboardingStep[] {
  return STEPS.filter((s) => s.enabled !== false);
}

/**
 * `done` and `dismissed` are deliberately different things.
 *
 * Finishing the flow is a decision. Escape, a scrim tap or a mis-hit Skip is
 * usually not — and treating them the same meant one stray tap removed the only
 * explanation this product ever offers, permanently, on the visit where the
 * user understood least. `?onboarding=reset` recovered it, which is no help to
 * anyone who does not read source.
 *
 * A dismissal is now re-offered exactly ONCE, on a later session. Not the same
 * session — re-appearing after someone just closed it is nagging, and they are
 * still in the context that made them close it. `dismissedAt` is a timestamp so
 * "later session" can mean a real gap rather than a reload.
 */
type State = {
  done: boolean;
  step: number;
  dismissed?: boolean;
  dismissedAt?: number;
  /** Set once the dismissal has been forgiven, so it is never re-offered again. */
  reoffered?: boolean;
};

/** How long after a dismissal the flow may be offered one more time. */
const REOFFER_AFTER_MS = 6 * 60 * 60 * 1000; // 6h - a later sitting, not a reload

function read(): State | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode — the flow just won't be remembered */
  }
}

/**
 * True when the flow should stay closed.
 *
 * Completing it is final. A dismissal is honoured too, except for the single
 * re-offer described on `State` — after which it is final as well.
 */
export function isComplete(): boolean {
  const s = read();
  if (!s) return false;
  if (s.done) return true;
  if (!s.dismissed) return false;
  if (s.reoffered) return true; // already had its second chance
  return Date.now() - (s.dismissedAt ?? 0) < REOFFER_AFTER_MS;
}

/**
 * Spend the single post-dismissal re-offer.
 *
 * This used to happen inside isComplete(), which made a question mutate the
 * answer: calling the predicate twice returned `false` then `true`, and the
 * second caller would suppress the very showing the first had just granted.
 * A predicate that is only safe to call once is a trap for the next person.
 * The write now happens in shouldShow(), at the one moment we actually know
 * the flow is about to be put on screen.
 */
function consumeReoffer() {
  const s = read();
  if (!s || s.done || !s.dismissed || s.reoffered) return;
  if (Date.now() - (s.dismissedAt ?? 0) < REOFFER_AFTER_MS) return;
  write({ ...s, reoffered: true });
}

/**
 * Closed without finishing — Escape, scrim, or Skip. Kept distinct from
 * complete() so the flow can be offered once more later.
 */
export function dismiss(step: number) {
  const s = read();
  write({
    done: false,
    step,
    dismissed: true,
    dismissedAt: Date.now(),
    reoffered: s?.reoffered === true,
  });
}

/** Resume point for a user who closed the tab mid-flow. */
export function savedStep(): number {
  return read()?.step ?? 0;
}

/**
 * Record the resume point, WITHOUT discarding the rest of the record.
 *
 * This previously wrote `{ done: false, step }` flat, which erased
 * `dismissed`, `dismissedAt` and `reoffered`. That silently undid the whole
 * point of tracking them: dismiss → re-offered six hours later → press Next
 * once → close the tab, and storage now looked like a user who had never seen
 * the flow at all. It then reappeared on every single visit, forever — the
 * exact nagging the two-state design was written to prevent, reachable in four
 * ordinary actions.
 *
 * `done` is carried through as well, so force-opening a completed flow with
 * `?onboarding=1` to check copy cannot un-complete it.
 */
export function saveStep(step: number) {
  const s = read();
  write({ ...s, done: s?.done === true, step });
}

export function complete() {
  write({ done: true, step: activeSteps().length });
}

/** Clear progress — used by the `?onboarding=reset` escape hatch. */
export function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Decide whether to show the flow, including the testing overrides.
 * `?onboarding=1` forces it open, `?onboarding=reset` clears and reopens,
 * `?onboarding=0` suppresses it — so the flow can be demoed or skipped
 * without clearing site data by hand.
 */
export function shouldShow(search: string): boolean {
  if (!ONBOARDING_ENABLED) return false;
  const params = new URLSearchParams(search);
  const override = params.get("onboarding");
  if (override === "0") return false;
  if (override === "reset") {
    reset();
    return true;
  }
  if (override === "1") return true;
  if (isComplete()) return false;
  // About to show it for real — if that is only possible because a dismissal
  // aged out, this is the one re-offer, and it is now spent.
  consumeReoffer();
  return true;
}
