import { useEffect, useRef, useState } from "react";
import type { CircuitDetailCorner } from "../types";
import { outlineToPath, trackShapeFor } from "../trackShapes";
import { officialCornerName } from "../cornerNames";

interface Props {
  circuitId: string;
  corners: CircuitDetailCorner[];
  /** Real racing-line points from FastF1 telemetry (unit box, uniform by lap
   * distance). When present the map is true geometry; otherwise it falls back
   * to the stylized shape from trackShapes.ts. */
  outline?: [number, number][] | null;
  /** Corner name -> value to show on hover / as a highlighted marker, e.g. real wetness. */
  highlightCornerName?: string | null;
}

interface Marker {
  x: number;
  y: number;
  corner: CircuitDetailCorner;
}

/** Callout state: everything in container px, computed on hover/click. */
interface Tip {
  marker: Marker;
  mx: number;
  my: number;
  cardLeft: number;
  cardTop: number;
  anchorX: number;
  anchorY: number;
}

/** Direction indicators along the lap, in content (viewBox) coords. */
interface Flow {
  arrowX: number;
  arrowY: number;
  arrowDeg: number;
  startX: number;
  startY: number;
  startDeg: number;
}

/** Zoom/pan of the map content: content point p renders at k*p + (tx, ty). */
interface Zoom {
  k: number;
  tx: number;
  ty: number;
}

const VIEW_W = 400;
const VIEW_H = 260;
const PAD = 18;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const CARD_W = 200;
const CARD_H_EST = 176; // worst-case card height, for clamping only

/** Keep the zoomed content covering the viewBox so panning can't lose the track. */
function clampZoom(k: number, tx: number, ty: number): Zoom {
  return {
    k,
    tx: Math.min(0, Math.max(VIEW_W * (1 - k), tx)),
    ty: Math.min(0, Math.max(VIEW_H * (1 - k), ty)),
  };
}

const SPEED_CLASS_COLOR: Record<string, string> = {
  slow: "var(--color-secondary-container)",
  medium: "var(--color-tertiary-fixed-dim)",
  fast: "var(--color-primary-fixed-dim)",
};

function TipRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono-data text-[9px] uppercase tracking-widest text-outline">{label}</span>
      <span className="font-mono-data text-[11px] font-bold tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

function ZoomButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded border border-outline-variant/40 bg-surface-container-lowest/85 text-on-surface-variant backdrop-blur-sm transition-colors hover:border-primary-fixed-dim hover:text-primary-fixed-dim disabled:opacity-40 disabled:hover:border-outline-variant/40 disabled:hover:text-on-surface-variant"
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}

/**
 * Places a marker for each real corner at its actual proportional distance
 * (start_pct, from FastF1) along the track loop. The loop itself is the real
 * racing line when the circuit JSON carries track_outline, and the stylized
 * schematic from trackShapes.ts when it doesn't.
 *
 * Corner callouts: hover previews, CLICK PINS -- a pinned callout stays up
 * (and tracks its marker through zoom/pan) until the marker is clicked again,
 * its ✕ is pressed, or the map background is clicked. A start/finish tick and
 * a direction arrow show which way the lap flows. The map zooms with the
 * wheel / buttons and pans by dragging, with markers and strokes kept at
 * constant screen size so turn data stays readable at any zoom.
 */
export default function TrackMap({ circuitId, corners, outline, highlightCornerName }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dragState = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const didDrag = useRef(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [pinned, setPinned] = useState(false);
  const [zoom, setZoom] = useState<Zoom>({ k: 1, tx: 0, ty: 0 });
  const [panning, setPanning] = useState(false);
  const realPath = outlineToPath(outline, VIEW_W, VIEW_H, PAD);
  const d = realPath ?? trackShapeFor(circuitId);
  const { k, tx, ty } = zoom;

  useEffect(() => {
    const path = pathRef.current;
    if (!path || corners.length === 0) {
      setMarkers([]);
      setFlow(null);
      return;
    }
    const total = path.getTotalLength();
    setMarkers(
      corners.map((corner) => {
        const point = path.getPointAtLength(corner.start_pct * total);
        return { x: point.x, y: point.y, corner };
      }),
    );

    // Direction indicators. Outline points are ordered by lap distance with
    // the path starting at the start/finish line, so path direction IS travel
    // direction -- but only for the real outline; the hand-drawn schematic
    // paths were authored with arbitrary winding, so no arrow there.
    const at = (len: number) => path.getPointAtLength(((len % total) + total) % total);
    const deg = (a: DOMPoint, b: DOMPoint) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    const s0 = at(0);
    const arrowPos = at(total * 0.03);
    setFlow({
      arrowX: arrowPos.x,
      arrowY: arrowPos.y,
      arrowDeg: deg(at(total * 0.02), at(total * 0.04)),
      startX: s0.x,
      startY: s0.y,
      startDeg: deg(s0, at(total * 0.005)),
    });
  }, [d, corners]);

  // Reset the viewport and any pinned callout when the circuit changes.
  useEffect(() => {
    setZoom({ k: 1, tx: 0, ty: 0 });
    setTip(null);
    setPinned(false);
  }, [circuitId]);

  /** Container-px callout placement for a marker at the current zoom/pan. */
  const positionFor = (m: Marker): Tip | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const s = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
    const mx = (m.x * k + tx) * s + (rect.width - VIEW_W * s) / 2;
    const my = (m.y * k + ty) * s + (rect.height - VIEW_H * s) / 2;
    // Callout sits beside the marker -- to the right when there's room,
    // flipped left otherwise -- tethered by a leader line.
    const gap = 52;
    const side = mx + gap + CARD_W + 6 <= rect.width ? 1 : -1;
    const cardLeft = side === 1 ? mx + gap : mx - gap - CARD_W;
    const cardTop = Math.min(Math.max(my - 84, 6), Math.max(rect.height - CARD_H_EST - 6, 6));
    return {
      marker: m,
      mx,
      my,
      cardLeft,
      cardTop,
      anchorX: side === 1 ? cardLeft : cardLeft + CARD_W,
      anchorY: cardTop + 26,
    };
  };

  const dismiss = () => {
    setPinned(false);
    setTip(null);
  };

  // A pinned callout tracks its marker while the user zooms or pans.
  useEffect(() => {
    if (!pinned) return;
    setTip((t) => (t ? (positionFor(t.marker) ?? t) : t));
    // positionFor reads the fresh zoom from this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, pinned]);

  /** Zoom by `factor` keeping the viewBox point (px, py) fixed on screen. */
  const applyZoom = (px: number, py: number, factor: number) => {
    if (!pinned) setTip(null);
    setZoom((z) => {
      const nextK = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z.k * factor));
      if (nextK === z.k) return z;
      const ratio = nextK / z.k;
      return clampZoom(nextK, px - (px - z.tx) * ratio, py - (py - z.ty) * ratio);
    });
  };

  // Wheel zoom must be a non-passive native listener -- browsers default
  // wheel to passive, which would ignore preventDefault and scroll the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const s = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
      const px = (e.clientX - rect.left - (rect.width - VIEW_W * s) / 2) / s;
      const py = (e.clientY - rect.top - (rect.height - VIEW_H * s) / 2) / s;
      applyZoomRef.current(px, py, e.deltaY < 0 ? 1.25 : 0.8);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  // Latest applyZoom (it closes over `pinned`) without re-binding the listener.
  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;

  const activeName = tip?.marker.corner.name;
  const official = tip ? officialCornerName(circuitId, tip.marker.corner.number) : null;
  const leaderDir = tip ? (tip.anchorX >= tip.mx ? 1 : -1) : 1;

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`h-full w-full ${k === 1 ? "overflow-visible" : ""} ${
          panning ? "cursor-grabbing" : k > 1 ? "cursor-grab" : ""
        }`}
        style={{ touchAction: k > 1 ? "none" : "auto" }}
        fill="none"
        onClick={() => {
          // Background click dismisses a pinned callout -- but not the click
          // that ends a pan drag.
          if (didDrag.current) {
            didDrag.current = false;
            return;
          }
          if (pinned) dismiss();
        }}
        onPointerDown={(e) => {
          if (k === 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragState.current = { cx: e.clientX, cy: e.clientY, tx, ty };
          didDrag.current = false;
          setPanning(true);
        }}
        onPointerMove={(e) => {
          const drag = dragState.current;
          if (!drag) return;
          if (Math.abs(e.clientX - drag.cx) + Math.abs(e.clientY - drag.cy) > 3) didDrag.current = true;
          const rect = svgRef.current!.getBoundingClientRect();
          const s = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
          if (!pinned) setTip(null);
          setZoom((z) => clampZoom(z.k, drag.tx + (e.clientX - drag.cx) / s, drag.ty + (e.clientY - drag.cy) / s));
        }}
        onPointerUp={() => {
          dragState.current = null;
          setPanning(false);
        }}
        onPointerCancel={() => {
          dragState.current = null;
          setPanning(false);
        }}
      >
        <g transform={`translate(${tx} ${ty}) scale(${k})`}>
          <path
            ref={pathRef}
            d={d}
            stroke="var(--color-primary-fixed-dim)"
            strokeOpacity={0.85}
            strokeWidth={3 / k}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path d={d} stroke="var(--color-primary-fixed-dim)" strokeOpacity={0.15} strokeWidth={14 / k} />

          {realPath && flow && (
            <>
              {/* start/finish tick, perpendicular to the racing line */}
              <g transform={`translate(${flow.startX} ${flow.startY}) rotate(${flow.startDeg}) scale(${1 / k})`}>
                <line x1={0} y1={-6.5} x2={0} y2={6.5} stroke="var(--color-on-surface)" strokeOpacity={0.75} strokeWidth={2} />
              </g>
              {/* travel-direction arrow just after the start line */}
              <g transform={`translate(${flow.arrowX} ${flow.arrowY}) rotate(${flow.arrowDeg}) scale(${1 / k})`}>
                <path d="M -3.5 -4.5 L 6 0 L -3.5 4.5 Z" fill="var(--color-primary-fixed-dim)" />
              </g>
            </>
          )}

          {markers.map((m) => {
            const isHighlighted = highlightCornerName === m.corner.name;
            const isActive = activeName === m.corner.name;
            const isPinnedMarker = pinned && isActive;
            return (
              <g
                key={m.corner.name}
                className="cursor-pointer"
                onMouseEnter={() => {
                  if (!pinned) setTip(positionFor(m));
                }}
                onMouseLeave={() => {
                  if (!pinned) setTip(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPinnedMarker) {
                    dismiss();
                  } else {
                    setTip(positionFor(m));
                    setPinned(true);
                  }
                }}
              >
                {/* generous invisible hit area so small markers are easy to hover */}
                <circle cx={m.x} cy={m.y} r={10 / k} fill="transparent" />
                {isPinnedMarker && (
                  /* radar-ping ring while pinned */
                  <circle
                    cx={m.x}
                    cy={m.y}
                    fill="none"
                    stroke="var(--color-primary-fixed-dim)"
                    strokeWidth={1 / k}
                  >
                    <animate attributeName="r" values={`${5 / k};${12 / k}`} dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={(isHighlighted || isActive ? 6 : 3.5) / k}
                  style={{ transition: "r 140ms ease" }}
                  fill={isHighlighted ? "var(--color-secondary-container)" : "var(--color-surface)"}
                  stroke={
                    isHighlighted
                      ? "var(--color-secondary)"
                      : isActive
                        ? "var(--color-primary-fixed)"
                        : "var(--color-primary-fixed-dim)"
                  }
                  strokeWidth={1.5 / k}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-1 top-1 z-10 flex flex-col items-center gap-1">
        <ZoomButton
          icon="zoom_in"
          label="Zoom in"
          disabled={k >= MAX_ZOOM}
          onClick={() => applyZoom(VIEW_W / 2, VIEW_H / 2, 1.5)}
        />
        <ZoomButton
          icon="zoom_out"
          label="Zoom out"
          disabled={k <= MIN_ZOOM}
          onClick={() => applyZoom(VIEW_W / 2, VIEW_H / 2, 1 / 1.5)}
        />
        <ZoomButton
          icon="crop_free"
          label="Reset view"
          disabled={k === 1}
          onClick={() => {
            if (!pinned) setTip(null);
            setZoom({ k: 1, tx: 0, ty: 0 });
          }}
        />
        {k > 1 && (
          <span className="font-mono-data text-[9px] tabular-nums text-outline">{k.toFixed(1)}×</span>
        )}
      </div>

      {tip && (
        <>
          {/* leader line tethering the callout to its corner marker */}
          <svg
            key={`leader-${tip.marker.corner.name}`}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <polyline
              points={`${tip.mx},${tip.my} ${tip.anchorX - leaderDir * 14},${tip.anchorY} ${tip.anchorX},${tip.anchorY}`}
              stroke="var(--color-primary-fixed-dim)"
              strokeOpacity={0.8}
              strokeWidth={1}
              fill="none"
              pathLength={1}
              strokeDasharray={1}
              style={{ animation: "leader-draw 240ms ease-out both" }}
            />
            <circle cx={tip.mx} cy={tip.my} r={2.5} fill="var(--color-primary-fixed-dim)" />
          </svg>

          <div
            key={`card-${tip.marker.corner.name}`}
            className={`absolute z-20 rounded border bg-surface-container-lowest/95 p-2.5 shadow-lg backdrop-blur-sm ${
              pinned ? "pointer-events-auto border-primary-fixed-dim/70" : "pointer-events-none border-primary-fixed-dim/40"
            }`}
            style={{ left: tip.cardLeft, top: tip.cardTop, width: CARD_W, animation: "callout-in 180ms ease-out both" }}
          >
            {pinned && (
              <button
                type="button"
                title="Close"
                onClick={dismiss}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-outline-variant/50 bg-surface-container text-on-surface-variant transition-colors hover:border-secondary-container hover:text-secondary-container"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            )}
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-outline-variant/30 pb-1.5">
              <span className="font-mono-data text-[11px] font-bold uppercase tracking-wider text-on-surface">
                {tip.marker.corner.name}
                {official && <span className="text-primary-fixed-dim"> — {official}</span>}
              </span>
              {tip.marker.corner.speed_class && (
                <span
                  className="shrink-0 font-mono-data text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: SPEED_CLASS_COLOR[tip.marker.corner.speed_class] }}
                >
                  {tip.marker.corner.speed_class}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {tip.marker.corner.apex_speed_kmh != null && (
                <TipRow label="Apex speed" value={`${tip.marker.corner.apex_speed_kmh} km/h`} />
              )}
              {tip.marker.corner.apex_gear != null && <TipRow label="Gear" value={tip.marker.corner.apex_gear} />}
              <TipRow label="Distance" value={`${Math.round(tip.marker.corner.distance_m)}m`} />
              <TipRow label="Lap position" value={`${Math.round(tip.marker.corner.start_pct * 100)}%`} />
            </div>
            {tip.marker.corner.apex_speed_kmh != null && (
              <p className="mt-1.5 border-t border-outline-variant/30 pt-1.5 font-mono-data text-[8px] uppercase leading-relaxed tracking-wider text-outline">
                Fastest-lap telemetry, 2025 race
              </p>
            )}
          </div>
        </>
      )}

      <span className="absolute bottom-1 right-1 rounded-xs bg-surface-container-lowest/80 px-1.5 py-0.5 font-mono-data text-[9px] uppercase tracking-widest text-outline">
        {realPath ? "Racing line · FastF1 telemetry" : "Schematic layout"}
      </span>
    </div>
  );
}
