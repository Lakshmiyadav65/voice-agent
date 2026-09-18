type PlaceholderPanelProps = {
  title: string;
  description: string;
  notes?: string[];
};

export function PlaceholderPanel({
  title,
  description,
  notes = [],
}: PlaceholderPanelProps) {
  return (
    <section className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Phase 1 placeholder
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        {description}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-6 space-y-2 border-t border-border pt-5 text-sm text-foreground">
          {notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
