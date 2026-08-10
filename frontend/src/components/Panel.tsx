interface Props {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

// Shared dashboard panel: slim header bar with a red tick, dense body.
export default function Panel({ title, right, children, className = "", bodyClassName = "p-4" }: Props) {
  return (
    <section className={`rounded-sm border border-carbon-700 bg-carbon-850 ${className}`}>
      <div className="flex items-center justify-between border-b border-carbon-700 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-0.5 bg-f1-red" />
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-400">
            {title}
          </h2>
        </div>
        {right}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
