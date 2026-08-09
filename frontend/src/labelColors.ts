export const LABEL_COLORS: Record<string, string> = {
  dry: "#d97706", // amber-600, dry asphalt
  damp: "#eab308", // yellow-500
  drying: "#84cc16", // lime-500, improving
  wet: "#2563eb", // blue-600
};

export function colorForLabel(label: string): string {
  return LABEL_COLORS[label] ?? "#6b7280";
}
