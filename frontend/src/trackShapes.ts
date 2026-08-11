/**
 * Stylized, NOT survey-accurate circuit outlines -- viewBox 0 0 400 260. There
 * is no real 2D track-geometry telemetry stored anywhere in this project
 * (build_circuit_data.py only pulls 1D corner *distance* along the lap, not
 * X/Y position), so a literal-accuracy map isn't something the backend can
 * support yet. These paths exist only to give the real per-corner data (name,
 * distance, count -- all real, from FastF1) a shape to sit on, loosely
 * evoking each circuit's well-known general character (Monaco tight and
 * boxy, Spa long with the Eau Rouge kink, Suzuka's famous figure-eight).
 * Label this "schematic" wherever it's shown -- see TrackMap.tsx.
 */
export const TRACK_SHAPES: Record<string, string> = {
  silverstone:
    "M 60 150 C 40 110, 55 70, 100 55 C 140 42, 160 60, 150 85 C 143 102, 165 100, 185 90 C 220 73, 260 55, 300 65 C 335 73, 350 100, 330 125 C 315 144, 325 160, 350 165 C 375 170, 380 195, 355 210 C 320 230, 260 225, 220 205 C 195 192, 190 210, 165 215 C 120 224, 75 205, 62 175 Z",
  monaco:
    "M 90 190 C 70 195, 55 180, 60 160 C 64 145, 85 145, 95 130 C 105 115, 95 100, 110 90 C 125 80, 150 85, 155 70 C 160 55, 185 50, 200 62 C 212 71, 205 88, 220 95 C 245 106, 280 95, 300 110 C 318 123, 310 148, 288 155 C 270 160, 268 178, 250 185 C 225 195, 195 178, 175 190 C 155 202, 125 200, 108 195 C 100 193, 96 191, 90 190 Z",
  spa: "M 70 120 C 65 100, 80 85, 100 90 C 118 94, 122 78, 108 65 C 96 54, 105 35, 125 38 C 145 41, 150 60, 170 62 C 210 66, 250 55, 290 68 C 320 78, 340 100, 335 130 C 331 155, 350 165, 365 185 C 378 202, 365 222, 342 220 C 315 218, 300 235, 270 232 C 230 228, 220 200, 190 195 C 150 188, 110 200, 85 180 C 68 167, 75 140, 70 120 Z",
  monza:
    "M 40 130 C 38 105, 55 92, 80 92 L 300 92 C 330 92, 350 108, 350 130 C 350 148, 336 155, 320 152 C 305 149, 298 160, 310 170 C 322 180, 312 198, 292 195 L 100 195 C 75 195, 55 182, 48 160 C 44 148, 52 145, 60 140 C 68 135, 55 130, 40 130 Z",
  suzuka:
    "M 60 90 C 45 78, 50 55, 75 50 C 105 44, 130 60, 155 62 C 185 64, 190 40, 220 42 C 250 44, 265 65, 250 85 C 238 100, 250 115, 270 118 C 300 122, 330 110, 350 130 C 368 148, 358 175, 332 180 C 305 185, 285 168, 260 172 C 230 177, 215 200, 185 198 C 155 196, 145 175, 155 155 C 163 140, 150 128, 130 130 C 105 133, 90 118, 95 100 C 98 90, 75 100, 60 90 Z",
};

export function trackShapeFor(circuitId: string): string {
  return TRACK_SHAPES[circuitId] ?? TRACK_SHAPES.silverstone;
}
