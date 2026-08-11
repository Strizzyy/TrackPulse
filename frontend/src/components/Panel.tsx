interface Props {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Reserve the tactical corner-bracket treatment for the one panel per
   * screen that most deserves the "targeting reticle" emphasis. */
  tactical?: boolean;
}

// Shared dashboard panel: obsidian glass surface, slim mono-label header.
export default function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
  tactical = false,
}: Props) {
  return (
    <section
      className={`glass-panel overflow-hidden rounded-lg ${tactical ? "tactical-border" : ""} ${className}`}
    >
      <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-0.5 bg-primary-fixed-dim" />
          <h2 className="font-mono-data text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
            {title}
          </h2>
        </div>
        {right}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
