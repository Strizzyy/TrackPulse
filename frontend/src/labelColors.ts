import type { CSSProperties } from "react";

// Apex Control palette: Racing Cyan = dry/optimal, Gold = caution/mid,
// Neon Red-Pink = wet/alert -- same semantics as the strategy board's
// compound colors and DESIGN.md's "Circuit Intelligence Palette".
export const LABEL_COLORS: Record<string, string> = {
  dry: "#00dbe7", // primary-fixed-dim, racing cyan
  damp: "#e8c423", // tertiary-fixed-dim, gold
  drying: "#74f5ff", // primary-fixed, lighter cyan -- improving, still cool-toned
  wet: "#ff525c", // secondary-container, neon red-pink
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
