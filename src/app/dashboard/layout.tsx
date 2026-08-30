import { AppShell } from "@/components/shell/AppShell";
import { ownerNav } from "@/lib/navigation";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell
      nav={ownerNav}
      title="Business dashboard"
      subtitle="Business owner"
      homeHref="/dashboard"
    >
      {children}
    </AppShell>
  );
}
