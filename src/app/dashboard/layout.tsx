import { AppShell } from "@/components/shell/AppShell";
import { getStaffViewBusinessId, requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerNav } from "@/lib/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireDashboardAccess();
  const viewing = await getStaffViewBusinessId();
  const viewedName = viewing ? (await getOwnerWorkspace(session.userId)).primaryBusiness?.name : null;

  return (
    <AppShell
      portal="client"
      nav={ownerNav}
      title="Business dashboard"
      subtitle={viewing ? "Staff view" : "Business owner"}
      homeHref="/dashboard"
      userLabel={session.profile.full_name ?? session.email}
    >
      {viewing ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p>
            You are viewing <span className="font-semibold">{viewedName ?? "a client"}</span>&apos;s dashboard as staff. This is
            what they see.
          </p>
          {/* A plain link: this is a route handler that clears the view, not a page. */}
          <a href="/api/trainer/view?exit=1" className="shrink-0 font-semibold underline">
            Exit to admin
          </a>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
