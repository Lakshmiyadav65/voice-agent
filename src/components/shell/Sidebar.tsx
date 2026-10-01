"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavGroup } from "@/lib/navigation";

type SidebarProps = {
  groups: NavGroup[];
  title: string;
  subtitle: string;
};

export function Sidebar({ groups, title, subtitle }: SidebarProps) {
  const pathname = usePathname();
  const homeHref = groups[0]?.items[0]?.href;

  return (
    <aside className="flex w-full flex-col border-b border-border bg-surface md:w-64 md:border-b-0 md:border-r md:min-h-[calc(100vh-3.5rem)]">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {subtitle}
        </p>
        <h1 className="mt-1 font-display text-lg font-semibold text-ink">{title}</h1>
      </div>
      {/* Groups flatten into one scrolling row on mobile and stack with headings on desktop. */}
      <nav className="flex gap-1 overflow-x-auto px-2 py-3 md:flex-col md:gap-5 md:overflow-visible">
        {groups.map((group) => (
          <div key={group.label} className="contents md:block">
            <p className="hidden px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted md:block">
              {group.label}
            </p>
            <div className="contents md:flex md:flex-col md:gap-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== homeHref && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-accent-soft text-accent"
                        : item.soon
                          ? "text-muted hover:bg-background"
                          : "text-foreground hover:bg-background"
                    }`}
                  >
                    {item.label}
                    {item.soon ? (
                      <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Soon
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
