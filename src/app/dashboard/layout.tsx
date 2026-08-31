import { AppShell } from "@/components/shell/AppShell";
import { requireDashboardAccess } from "@/lib/auth/session";
import { ownerNav } from "@/lib/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireDashboardAccess();

  return (
    <AppShell
      nav={ownerNav}
      title="Business dashboard"
      subtitle="Business owner"
      homeHref="/dashboard"
      userLabel={session.profile.full_name ?? session.email}
    >
      {children}
    </AppShell>
  );
}
