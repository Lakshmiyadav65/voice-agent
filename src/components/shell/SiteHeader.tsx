import Link from "next/link";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  return (
    <header
      className={`flex items-center justify-between border-b border-border bg-surface ${
        compact ? "px-4 py-3" : "px-6 py-4 md:px-10"
      }`}
    >
      <Link href="/" className="group flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
          AI Employee
        </span>
        <span className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted sm:inline">
          Platform
        </span>
      </Link>
      {!compact ? (
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent-soft hover:text-accent"
          >
            Business owner
          </Link>
          <Link
            href="/trainer"
            className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-accent"
          >
            AI trainer
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
