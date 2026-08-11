import { useEffect, useRef, useState } from "react";
import type { CircuitDetailCorner } from "../types";
import { trackShapeFor } from "../trackShapes";

interface Props {
  circuitId: string;
  corners: CircuitDetailCorner[];
  /** Corner name -> value to show on hover / as a highlighted marker, e.g. real wetness. */
  highlightCornerName?: string | null;
}

interface Marker {
  x: number;
  y: number;
  corner: CircuitDetailCorner;
}

/**
 * Places a marker for each real corner at its actual proportional distance
 * (start_pct, from FastF1) along a stylized loop -- see trackShapes.ts for
 * why the loop itself is schematic, not survey-accurate.
 */
export default function TrackMap({ circuitId, corners, highlightCornerName }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const d = trackShapeFor(circuitId);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || corners.length === 0) {
      setMarkers([]);
      return;
    }
    const total = path.getTotalLength();
    const next = corners.map((corner) => {
      const point = path.getPointAtLength(corner.start_pct * total);
      return { x: point.x, y: point.y, corner };
    });
    setMarkers(next);
  }, [d, corners]);

  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 400 260" className="h-full w-full overflow-visible" fill="none">
        <path
          ref={pathRef}
          d={d}
          stroke="var(--color-primary-fixed-dim)"
          strokeOpacity={0.85}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d={d} stroke="var(--color-primary-fixed-dim)" strokeOpacity={0.15} strokeWidth={14} />

        {markers.map((m) => {
          const isHighlighted = highlightCornerName === m.corner.name;
          return (
            <g key={m.corner.name} className="cursor-default">
              <circle
                cx={m.x}
                cy={m.y}
                r={isHighlighted ? 6 : 3.5}
                fill={isHighlighted ? "var(--color-secondary-container)" : "var(--color-surface)"}
                stroke={isHighlighted ? "var(--color-secondary)" : "var(--color-primary-fixed-dim)"}
                strokeWidth={1.5}
              >
                <title>
                  {m.corner.name} · {m.corner.distance_m}m
                </title>
              </circle>
            </g>
          );
        })}
      </svg>

      <span className="absolute bottom-1 right-1 rounded-xs bg-surface-container-lowest/80 px-1.5 py-0.5 font-mono-data text-[9px] uppercase tracking-widest text-outline">
        Schematic layout
      </span>
    </div>
  );
}
