import type { CSSProperties } from "react";

// Base hues per condition, picked to stay legible as text on the carbon
// (#15151E) dark surfaces -- brighter steps than the old light-theme solids.
export const LABEL_COLORS: Record<string, string> = {
  dry: "#f59e0b", // amber, dry asphalt
  damp: "#facc15", // yellow
  drying: "#a3e635", // lime, improving
  wet: "#38bdf8", // sky blue
};

export function colorForLabel(label: string): string {
  return LABEL_COLORS[label] ?? "#9ca3af";
}

// Tinted chip (translucent fill + colored text/border) instead of a solid
// block -- solid yellow/lime with white text failed contrast on both themes.
export function chipStyleForLabel(label: string): CSSProperties {
  const base = colorForLabel(label);
  return {
    color: base,
    backgroundColor: `${base}26`, // ~15% alpha
    border: `1px solid ${base}59`, // ~35% alpha
  };
}
