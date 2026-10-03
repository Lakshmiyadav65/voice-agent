"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import type { NavGroup } from "@/lib/navigation";

type SidebarProps = {
  groups: NavGroup[];
  title: string;
  subtitle: string;
  homeHref: string;
  userLabel?: string;
  /** A solid pill above the name, so staff always know they are in the admin portal. */
  badge?: string;
};

/** Line icons keyed by the last path segment; pages without one get a neutral dot. */
const ICON_PATHS: Record<string, ReactNode> = {
  dashboard: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  trainer: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  agents: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  "ai-employee": <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z" />,
  business: <path d="M4 21V7l8-4 8 4v14M9 21v-6h6v6" />,
  campaigns: <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" />,
  leads: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .7 3 2.3 3.5 5" />
    </>
  ),
  calls: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  appointments: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  whatsapp: <path d="M21 12a9 9 0 0 1-13.2 8L3 21l1.1-4.6A9 9 0 1 1 21 12z" />,
  usage: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
};

function NavIcon({ href }: { href: string }) {
  const key = href.split("/").filter(Boolean).pop() ?? "";
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {ICON_PATHS[key] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

export function Sidebar({ groups, title, subtitle, homeHref, userLabel, badge }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-border bg-surface md:sticky md:top-3 md:h-[calc(100vh-1.5rem)] md:w-64 md:shrink-0 md:rounded-2xl md:border md:shadow-xs">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 md:px-5 md:pt-6">
        <Link href={homeHref} className="min-w-0">
          {badge ? (
            <span className="mb-1.5 inline-block rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              {badge}
            </span>
          ) : null}
          <span className="block truncate font-display text-2xl text-ink">AI Employee</span>
          <span className="block truncate text-xs text-muted">
            {subtitle} · {title}
          </span>
        </Link>
        {/* On phones the account links sit up here; on desktop they live at the bottom of the card. */}
        <div className="md:hidden">
          <SignOutButton />
        </div>
      </div>

      {/* Groups flatten into one scrolling row on mobile and stack with headings on desktop. */}
      <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto md:px-3 md:py-4">
        {groups.map((group) => (
          <div key={group.label} className="contents md:block">
            <p className="hidden px-3 pb-1.5 text-sm text-muted md:block">{group.label}</p>
            <div className="contents md:flex md:flex-col md:gap-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] transition ${
                      active
                        ? "bg-background font-semibold text-ink"
                        : item.soon
                          ? "text-muted hover:bg-background"
                          : "text-foreground hover:bg-background"
                    }`}
                  >
                    <NavIcon href={item.href} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.soon ? (
                      <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Soon</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="hidden items-center gap-3 border-t border-border px-5 py-4 md:flex">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
          {(userLabel ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{userLabel}</p>
          <div className="flex items-center gap-3">
            <SignOutButton />
            <Link href="/" className="text-sm text-muted hover:text-foreground">
              Home
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
