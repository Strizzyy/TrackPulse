import type { CornerSummary } from "../types";
import { chipStyleForLabel, colorForLabel } from "../labelColors";
import { mediaUrl } from "../api";

interface Props {
  corners: CornerSummary[];
}

// Analyst-style table: one row per corner with its real representative
// frame as a thumbnail, the numeric score, a wetness bar, and the label.
// Swap for a real SVG track map later if there's time.
export default function CornerStrip({ corners }: Props) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-carbon-700 text-xs uppercase tracking-[0.15em] text-neutral-500">
          <th className="px-3 py-2 text-left font-semibold" colSpan={2}>
            Corner
          </th>
          <th className="px-3 py-2 text-right font-semibold">Wetness</th>
          <th className="px-3 py-2 text-left font-semibold">Level</th>
          <th className="px-3 py-2 text-right font-semibold">Cond</th>
        </tr>
      </thead>
      <tbody>
        {corners.map((c) => (
          <tr key={c.corner} className="border-b border-carbon-800 last:border-b-0">
            <td className="py-1.5 pl-3 pr-1">
              <img
                src={mediaUrl(c.image_url)}
                alt={c.corner}
                className="h-10 w-16 rounded-xs border border-carbon-700 object-cover"
              />
            </td>
            <td className="px-3 py-1.5 font-semibold text-neutral-200">{c.corner}</td>
            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-neutral-300">
              {c.avg_wetness.toFixed(2)}
            </td>
            <td className="px-3 py-1.5">
              <div className="h-2 w-full min-w-20 rounded-full bg-carbon-700">
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
                className="inline-block rounded-xs px-2 py-0.5 text-xs font-semibold uppercase"
                style={chipStyleForLabel(c.label)}
              >
                {c.label}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
