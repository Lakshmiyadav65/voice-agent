import Link from "next/link";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  if (compact) {
    return (
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            AI Employee
          </span>
        </Link>
      </header>
    );
  }

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-10">
      <Link href="/" className="flex items-baseline gap-2 text-white">
        <span className="font-display text-2xl font-semibold tracking-tight md:text-[1.7rem]">
          AI Employee
        </span>
      </Link>
      <nav className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard"
          className="rounded-md px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white"
        >
          Dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-md bg-hero-lime px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-105"
        >
          Log in
        </Link>
      </nav>
    </header>
  );
}
