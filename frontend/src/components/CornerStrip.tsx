import type { CornerSummary } from "../types";
import { colorForLabel } from "../labelColors";
import { mediaUrl } from "../api";

interface Props {
  corners: CornerSummary[];
}

// Deliberately not a geographically accurate track outline -- corners in
// order, each with its actual representative frame image (the real frame
// closest to that corner's average score, not a stock photo) and colored
// by condition. Swap for a real SVG track map later if there's time.
export default function CornerStrip({ corners }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {corners.map((c) => (
        <div
          key={c.corner}
          className="w-32 overflow-hidden rounded-md border border-gray-200"
          title={`${c.corner}: ${c.label} (${c.avg_wetness.toFixed(2)})`}
        >
          <img src={mediaUrl(c.image_url)} alt={c.corner} className="h-20 w-full object-cover" />
          <div
            className="flex flex-col items-center justify-center px-2 py-1 text-white text-xs"
            style={{ backgroundColor: colorForLabel(c.label) }}
          >
            <span className="font-medium text-center leading-tight">{c.corner}</span>
            <span className="opacity-90">{c.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
