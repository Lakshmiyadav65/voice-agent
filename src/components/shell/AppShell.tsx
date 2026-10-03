import { Sidebar } from "@/components/shell/Sidebar";
import type { NavGroup } from "@/lib/navigation";

type AppShellProps = {
  children: React.ReactNode;
  nav: NavGroup[];
  title: string;
  subtitle: string;
  homeHref: string;
  userLabel?: string;
  /** "staff" switches to the admin portal's blue palette (globals.css); clients keep green. */
  portal: "client" | "staff";
};

/** Console-style frame: a floating sidebar card beside the page, no top bar. */
export function AppShell({ children, nav, title, subtitle, homeHref, userLabel, portal }: AppShellProps) {
  return (
    <div data-portal={portal} className="min-h-full bg-background md:flex md:gap-3 md:p-3">
      <Sidebar
        groups={nav}
        title={title}
        subtitle={subtitle}
        homeHref={homeHref}
        userLabel={userLabel}
        badge={portal === "staff" ? "Admin portal" : undefined}
      />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-5 md:py-4">{children}</main>
    </div>
  );
}
