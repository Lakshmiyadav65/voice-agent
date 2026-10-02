import { AppShell } from "@/components/shell/AppShell";
import { requireTrainerAccess } from "@/lib/auth/session";
import { trainerNav } from "@/lib/navigation";

/** The admin page sits inside the staff console: same menu, same staff-only login. */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireTrainerAccess();

  return (
    <AppShell
      nav={trainerNav}
      title="Trainer console"
      subtitle="Internal AI trainer"
      homeHref="/trainer"
      userLabel={session.profile.full_name ?? session.email}
    >
      {children}
    </AppShell>
  );
}
