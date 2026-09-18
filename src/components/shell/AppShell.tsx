import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { Sidebar } from "@/components/shell/Sidebar";
import type { NavItem } from "@/lib/navigation";

type AppShellProps = {
  children: React.ReactNode;
  nav: NavItem[];
  title: string;
  subtitle: string;
  homeHref: string;
  userLabel?: string;
};

export function AppShell({
  children,
  nav,
  title,
  subtitle,
  homeHref,
  userLabel,
}: AppShellProps) {
  return (
    <div className="min-h-full bg-background">
      <SiteHeader compact />
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2 text-sm md:px-6">
        <Link href={homeHref} className="font-medium text-accent hover:underline">
          {title}
        </Link>
        <div className="flex items-center gap-4">
          {userLabel ? (
            <span className="hidden text-muted sm:inline">{userLabel}</span>
          ) : null}
          <SignOutButton />
          <Link href="/" className="text-muted hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        <Sidebar items={nav} title={title} subtitle={subtitle} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
