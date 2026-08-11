---
name: Apex Control Evolved
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f21'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#849495'
  outline-variant: '#3a494b'
  surface-tint: '#00dbe7'
  primary: '#e1fdff'
  on-primary: '#00363a'
  primary-container: '#00f2ff'
  on-primary-container: '#006a71'
  inverse-primary: '#00696f'
  secondary: '#ffb3b2'
  on-secondary: '#680012'
  secondary-container: '#ff525c'
  on-secondary-container: '#5b000f'
  tertiary: '#fff6e4'
  on-tertiary: '#3b2f00'
  tertiary-container: '#fed83a'
  on-tertiary-container: '#725e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#74f5ff'
  primary-fixed-dim: '#00dbe7'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#ffdad8'
  secondary-fixed-dim: '#ffb3b2'
  on-secondary-fixed: '#410008'
  on-secondary-fixed-variant: '#92001e'
  tertiary-fixed: '#ffe173'
  tertiary-fixed-dim: '#e8c423'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#554500'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
typography:
  headline-xl:
    fontFamily: Anybody
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Anybody
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  call-to-action:
    fontFamily: Anybody
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.4'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  telemetry-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: -0.01em
  label-xs:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-padding: 12px
  data-row-height: 32px
---

## Brand & Style

This design system is engineered for the high-stakes, split-second decision-making environment of a professional race strategist. The brand personality is **authoritative, analytical, and urgent**, designed to process vast quantities of live telemetry without cognitive fatigue.

The visual style is a hybrid of **Mission-Control Professionalism** and **Tactical Glassmorphism**. It utilizes an "Obsidian" dark-mode base to minimize eye strain in low-light pit wall environments, while high-vibrancy accents provide immediate visual cues for critical status changes. Containers use subtle backdrop blurs to create depth, separated by precision-milled tactical borders that define the high-density grid. The aesthetic should feel like a premium, bespoke military-grade interface—rugged yet mathematically precise.

## Colors

The palette is anchored by **Obsidian Base**, a near-black neutral that provides maximum contrast for the glow of tactical data.

- **Primary (Racing Cyan):** Used for active telemetry streams, primary navigation, and "safe/optimal" state indicators.
- **Secondary (Neon Red):** Reserved for alerts, critical performance degradation, and sector-behind timings.
- **Circuit Intelligence Palette:**
    - **Monaco Gold:** Used for strategy ranking and podium-contender data.
    - **Monza Green:** Indicates track improvement, fast sectors, and optimal weather windows.
    - **Suzuka Red:** Used for pit-stop windows and severe weather warnings.

Surfaces should utilize the **Surface Glass** value with a `backdrop-filter: blur(12px)` and a 1px border of `white/10%` to maintain the tactical, layered feel.

## Typography

The typographic hierarchy prioritizes speed of recognition.

- **Strategic Calls:** Utilize **Anybody** for its aggressive, variable-width impact. It is used for "Calls to Action" and major alerts where urgency is paramount.
- **General Interface:** **Hanken Grotesk** provides a clean, modern grotesque feel for metadata, settings, and descriptive text.
- **Telemetry & Data:** **JetBrains Mono** is the workhorse of the system. Its fixed-width character set ensures that rapidly changing lap times and sensor data do not cause "visual jitter" on the dashboard. Use this for all table data and the Session History timeline.

## Layout & Spacing

The system uses a **Fixed Grid** model optimized for ultra-wide strategist monitors (1440px+), with a 12-column structure. 

- **Density:** High density is required. Standard padding is reduced to a 4px base unit to maximize information on screen.
- **Grid:** 16px gutters provide "breathing room" between dense modules, acting as tactical trenches. 
- **Mobile/Tablet:** For tablet views, modules collapse into a single-column scroll with "Weather" and "Critical Alerts" pinned to the top.
- **Session History:** This component spans the full 12-columns at the bottom of the viewport, acting as a horizontal scrubbable timeline.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** and **Backdrop Blurs** rather than traditional shadows.

1. **Base (Level 0):** Pure Obsidian (#050506).
2. **Module Surface (Level 1):** Semi-transparent glass (20% opacity) with a 12px blur.
3. **Active/Overlay (Level 2):** Higher opacity glass (40%) with a subtle internal glow (inner shadow) of the primary color (Racing Cyan) at 10% opacity.

Tactical borders (1px, solid) are the primary separator. Critical modules use a "corner-bracket" style border treatment to evoke targeting reticles and mission-control displays.

## Shapes

The design system uses **Soft (0.25rem)** roundedness to maintain a technical, engineered feel. Avoid fully rounded pill shapes except for status indicators (LED style).

- **Standard Containers:** 4px radius.
- **Buttons:** 4px radius for a "keyed" look.
- **Weather Modules:** Use 45-degree chamfered corners on the top-right to indicate "Active Intel."

## Components

- **Strategy Tables:** Data-dense rows with a 32px height. Alternate row striping using `white/2%`. Column headers use `label-xs` in `Racing Cyan`.
- **Weather Modules:** Circular glass containers with SVG weather icons. Dynamic background tints (e.g., Monza Green for drying, Suzuka Red for incoming rain).
- **Session History Timeline:** A horizontal axis where each lap is a vertical bar. Color-code bars by tire compound (Yellow, Red, White) or pace delta.
- **Tactical Buttons:** Ghost-style buttons with `Racing Cyan` borders. On hover, they fill with a 10% Cyan glow.
- **Status Chips:** Small, monospaced labels with a solid 2px "LED" dot to the left, indicating live connection or sensor status.
- **Input Fields:** Recessed dark surfaces with a bottom-only border in `Racing Cyan` that glows on focus.