"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/navigation";

type SidebarProps = {
  items: NavItem[];
  title: string;
  subtitle: string;
};

export function Sidebar({ items, title, subtitle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-border bg-surface md:w-64 md:border-b-0 md:border-r md:min-h-[calc(100vh-3.5rem)]">
      <div className="border-b border-border px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {subtitle}
        </p>
        <h1 className="mt-1 font-display text-lg font-semibold text-ink">{title}</h1>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 py-3 md:flex-col md:overflow-visible">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== items[0]?.href && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-foreground hover:bg-background"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
