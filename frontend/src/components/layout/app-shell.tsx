"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

type NavItem = {
  href: string;
  label: string;
};

export function AppShell({
  title,
  subtitle,
  nav,
  children,
  sidebar,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </aside>

        <div className={sidebar ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]" : ""}>
          <main>{children}</main>
          {sidebar ? <aside className="space-y-4">{sidebar}</aside> : null}
        </div>
      </div>
    </div>
  );
}
