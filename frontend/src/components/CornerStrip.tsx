import type { CornerSummary } from "../types";
import { chipStyleForLabel, colorForLabel } from "../labelColors";
import { mediaUrl } from "../api";

interface Props {
  corners: CornerSummary[];
  /** Currently focused corner name, if any -- its row is highlighted. */
  activeCorner?: string | null;
  /** Row click -> focus this corner (parent shows its frame in the analysis panel). */
  onSelect?: (corner: string) => void;
}

// Analyst-style table: one row per corner with its real representative
// frame as a thumbnail, the numeric score, a wetness bar, and the label.
// Rows are clickable when onSelect is provided -- the parent focuses the
// clicked corner's frame.
export default function CornerStrip({ corners, activeCorner, onSelect }: Props) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="h-9 border-b border-outline-variant/40 font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
          <th className="px-3 text-left font-medium" colSpan={2}>
            Corner
          </th>
          <th className="px-3 text-right font-medium">Wetness</th>
          <th className="px-3 text-left font-medium">Level</th>
          <th className="px-3 text-right font-medium">Cond</th>
        </tr>
      </thead>
      <tbody>
        {corners.map((c) => {
          const isActive = activeCorner === c.corner;
          return (
            <tr
              key={c.corner}
              onClick={() => onSelect?.(c.corner)}
              className={`border-b border-outline-variant/15 transition-colors last:border-b-0 ${
                onSelect ? "cursor-pointer" : ""
              } ${
                isActive
                  ? "border-l-2 border-l-primary-fixed-dim bg-primary-fixed-dim/10"
                  : "hover:bg-white/5"
              }`}
            >
              <td className="py-1.5 pl-3 pr-1">
                <img
                  src={mediaUrl(c.image_url)}
                  alt={c.corner}
                  className={`h-10 w-16 rounded-xs border object-cover ${
                    isActive ? "border-primary-fixed-dim/60" : "border-outline-variant/30"
                  }`}
                />
              </td>
              <td
                className={`px-3 py-1.5 font-semibold ${
                  isActive ? "text-primary-fixed-dim" : "text-on-surface"
                }`}
              >
                {c.corner}
              </td>
              <td className="px-3 py-1.5 text-right font-mono-data tabular-nums text-on-surface-variant">
                {c.avg_wetness.toFixed(2)}
              </td>
              <td className="px-3 py-1.5">
                <div className="h-2 w-full min-w-20 rounded-full bg-surface-container-high">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.round(Math.min(1, Math.max(0, c.avg_wetness)) * 100)}%`,
                      backgroundColor: colorForLabel(c.label),
                    }}
                  />
                </div>
              </td>
              <td className="px-3 py-1.5 text-right">
                <span
                  className="inline-block rounded-xs px-2 py-0.5 font-mono-data text-xs font-semibold uppercase"
                  style={chipStyleForLabel(c.label)}
                >
                  {c.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
