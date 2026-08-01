"use client";
// Interactive globe (cobe v2) with BESS sites pinned. The globe auto-spins,
// pauses on hover, and is drag-to-rotate. HTML pins are positioned each frame
// via an orthographic projection using the same phi/theta/scale cobe renders
// with, so green dots stay glued to the sphere and get hover tooltips.
// A focused site (row click in the list, or a pin click) eases the camera to
// its coordinates, zooms in, and holds its tooltip open; dragging the globe
// releases the focus back to auto-spin.
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import createGlobe from "cobe";
import { bessMarkers } from "@/lib/protocol";
import { fmtPct, bpsToPct, fmtPower, fmtEnergy } from "@/lib/format";
import { Flag } from "./Flag";
import { statusLabel } from "./vaultStatus";

const MARKERS = bessMarkers();

const THETA = 0.55; // resting view-centre latitude
const PHI_BASE = 4.46; // rotate so ~15°E faces front
const AUTO_SPEED = 0.0026;
const R_FRAC = 0.46; // sphere radius / stage width at scale 1
const FOCUS_SCALE = 1.42;
const EASE = 0.075; // per-frame lerp factor toward focus targets

/** Camera angles that put (lat,lng) at the centre of the view. */
function targetsFor([lat, lng]: [number, number]) {
  return {
    phi: 1.5 * Math.PI - (lng * Math.PI) / 180,
    theta: (lat * Math.PI) / 180,
  };
}

/** Shortest signed angular distance a→b. */
function angleDelta(a: number, b: number) {
  return ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

/** Orthographic projection of (lat,lng) at view (lon0=1.5π−phi, lat0=theta). */
function project(lat: number, lng: number, phi: number, theta: number) {
  const b = (lat * Math.PI) / 180;
  const lng0 = 1.5 * Math.PI - phi;
  const dl = (lng * Math.PI) / 180 - lng0;
  const x = Math.cos(b) * Math.sin(dl);
  const y = Math.cos(theta) * Math.sin(b) - Math.sin(theta) * Math.cos(b) * Math.cos(dl);
  const cosc = Math.sin(theta) * Math.sin(b) + Math.cos(theta) * Math.cos(b) * Math.cos(dl);
  return { x, y, visible: cosc > 0 };
}

interface Props {
  focusId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function BessGlobe({ focusId = null, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const phiRef = useRef(PHI_BASE);
  const thetaRef = useRef(THETA);
  const scaleRef = useRef(1);
  // Read through a ref rather than a dependency: the rAF effect also creates
  // and destroys the globe instance, so re-running it on a media-query change
  // would tear down and rebuild the canvas. The loop picks the new value up on
  // its next frame instead.
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  const focusRef = useRef<(typeof MARKERS)[number] | null>(null);
  const draggingRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The rAF loop mounts once; it reads the focused marker through a ref.
  useEffect(() => {
    focusRef.current = focusId ? MARKERS.find((m) => m.id === focusId) ?? null : null;
  }, [focusId]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    let width = stage.offsetWidth || 400;
    const onResize = () => { width = stage.offsetWidth || width; };
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: PHI_BASE,
      theta: THETA,
      dark: 1,
      diffuse: 1.15,
      mapSamples: 16000,
      mapBrightness: 7.2,
      baseColor: [0.2, 0.5, 0.42],
      markerColor: [0.1, 0.95, 0.6],
      glowColor: [0.13, 0.6, 0.45],
      opacity: 0.92,
      scale: 1,
      markers: [],
    });

    let raf = 0;
    const tick = () => {
      const focus = focusRef.current;
      if (focus && draggingRef.current === null) {
        const t = targetsFor(focus.coords);
        phiRef.current += angleDelta(phiRef.current, t.phi) * EASE;
        thetaRef.current += (t.theta - thetaRef.current) * EASE;
        scaleRef.current += (FOCUS_SCALE - scaleRef.current) * EASE;
      } else {
        // The idle spin is the only continuous motion here; the rest of this
        // loop is easing toward a target the user asked for, or drawing. So
        // reduced motion stops the spin and leaves the globe usable.
        if (draggingRef.current === null && !hoveringRef.current && !reducedMotionRef.current) {
          phiRef.current += AUTO_SPEED;
        }
        thetaRef.current += (THETA - thetaRef.current) * EASE;
        scaleRef.current += (1 - scaleRef.current) * EASE;
      }

      globe.update({
        phi: phiRef.current,
        theta: thetaRef.current,
        scale: scaleRef.current,
        width: width * 2,
        height: width * 2,
      });

      const R = width * R_FRAC * scaleRef.current;
      for (let i = 0; i < MARKERS.length; i++) {
        const el = pinRefs.current[i];
        if (!el) continue;
        const p = project(MARKERS[i].coords[0], MARKERS[i].coords[1], phiRef.current, thetaRef.current);
        const lim = width / 2 - 4; // zoomed sphere exceeds the stage; drop out-of-frame pins
        if (!p.visible || Math.abs(p.x * R) > lim || Math.abs(p.y * R) > lim) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        } else {
          el.style.opacity = "1";
          el.style.pointerEvents = "auto";
          el.style.transform = `translate(-50%, -50%) translate(${width / 2 + p.x * R}px, ${width / 2 - p.y * R}px)`;
        }
      }
      canvas.style.opacity = "1";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Dragging takes manual control: release any focused site.
  const onDown = (e: React.PointerEvent) => {
    onSelectRef.current?.(null);
    draggingRef.current = e.clientX;
    stageRef.current?.setPointerCapture(e.pointerId);
    if (stageRef.current) stageRef.current.style.cursor = "grabbing";
  };
  const endDrag = () => {
    draggingRef.current = null;
    if (stageRef.current) stageRef.current.style.cursor = "grab";
  };
  const onMove = (e: React.PointerEvent) => {
    if (draggingRef.current === null) return;
    const delta = e.clientX - draggingRef.current;
    draggingRef.current = e.clientX;
    phiRef.current += delta / 140;
  };

  return (
    <div className="globe-stage-wrap">
      <div
        ref={stageRef}
        className="globe-stage"
        onPointerDown={onDown}
        onPointerUp={endDrag}
        onPointerMove={onMove}
        onPointerEnter={() => (hoveringRef.current = true)}
        onPointerLeave={() => { hoveringRef.current = false; endDrag(); }}
      >
        {/* Hidden from assistive tech rather than labelled (WCAG 1.1.1).
            The canvas is a decorative rendering: it carries no information
            that is not already text in the .globe-pin tooltips beside it —
            every site's name, country, power and status. Describing the
            drawing on top of that is noise, and a canvas with role="img" and
            no name (which is what it had) is worse still: an element in the
            accessibility tree that announces "image" and says nothing.

            The pins are siblings, not children — a canvas cannot have DOM
            children — so hiding this does not hide them. */}
        <canvas ref={canvasRef} className="globe-canvas" aria-hidden="true" />
        <div className="globe-pins">
          {MARKERS.map((m, i) => (
            <div
              key={m.id}
              className={`globe-pin ${focusId === m.id ? "selected" : ""}`}
              ref={(el) => { pinRefs.current[i] = el; }}
            >
              <span
                className="globe-dot"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectRef.current?.(focusId === m.id ? null : m.id);
                }}
              />
              <div className="globe-tip">
                <div className="globe-tip-name"><Flag code={m.flag} size={13} /> {m.name}</div>
                <div className="globe-tip-sub">{m.location} ·{" "}
                  {/* Third surface with this same problem, after the vault
                      cards and NetworkPanel. The marker carries MW/MWh, and
                      printing them raw makes BESS Ljubljana 01 read
                      "0.35 MW / 0.55 MWh" where its card says "350 kW / 550
                      kWh". fmtPower/fmtEnergy pick the unit by magnitude, so a
                      sub-megawatt site keeps its kW. */}
                  {fmtPower(m.capacityMw * 1000)} / {fmtEnergy(m.energyMwh * 1000)}</div>
                <div className="globe-tip-sub">
                  {/* "APY" was hardcoded here for every marker, including the
                      two showcase sites whose number is a gross yield on capex.
                      VaultCard, VaultDetail and now VaultsOverview all draw
                      this distinction; the globe was the last surface still
                      flattening it. */}
                  {/* Was `status.replace("_", " ")` — the raw enum value with an
                      underscore swapped out, which produced a third spelling of
                      a status the rest of the app already had a word for. */}
                  <span className="globe-tip-status">{statusLabel(m.status)}</span> · {fmtPct(bpsToPct(m.apyBps))} {m.apyIsGross ? "gross yield" : "APY"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
