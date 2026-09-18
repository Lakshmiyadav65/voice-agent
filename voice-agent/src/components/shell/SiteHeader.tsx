import Link from "next/link";

type SiteHeaderProps = {
  compact?: boolean;
};

export function SiteHeader({ compact = false }: SiteHeaderProps) {
  if (compact) {
    return (
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          AI Employee
        </Link>
      </header>
    );
  }

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-12">
      <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">
        AI Employee
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <a
          href="#how-it-works"
          className="hidden rounded-md px-3 py-2 text-sm font-medium text-white/75 transition hover:text-white md:inline"
        >
          How it works
        </a>
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
